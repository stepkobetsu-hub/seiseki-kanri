// Shared authentication client. Authorization remains on the server.
(function () {
  'use strict';
  const endpoints = [
    'https://wisedgcgwaebtkprdhth.supabase.co/functions/v1/seiseki-admin-runtime-v1',
    'https://wisedgcgwaebtkprdhth.functions.supabase.co/seiseki-admin-runtime-v1'
  ];
  let activeEndpoint = 0;
  async function fetchRuntime(payload, signal) {
    const first = activeEndpoint;
    for (let attempt = 0; attempt < endpoints.length; attempt++) {
      const index = (first + attempt) % endpoints.length;
      try {
        const response = await fetch(endpoints[index], {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify(payload), cache: 'no-store', signal
        });
        activeEndpoint = index;
        return response;
      } catch (error) {
        if (error.name === 'AbortError' || !(error instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(String(error.message || ''))) || attempt === endpoints.length - 1) throw error;
      }
    }
  }
  async function requestOnce(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), payload.action === 'staffLogin' ? 90000 : 45000);
    try {
      const response = await fetchRuntime({ ...payload, permissionAppId: /student_directory/.test(location.pathname) ? 'student-directory' : /meeting_memo|classroom_reports/.test(location.pathname) ? 'public-13' : 'public-12' }, controller.signal);
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) {
        throw new Error(result.error || 'ログイン情報を確認できませんでした。');
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('ログイン確認がタイムアウトしました。もう一度お試しください。');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  async function request(payload) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await requestOnce(payload);
      } catch (error) {
        const networkFailure = error instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(String(error.message || ''));
        if (!networkFailure) throw error;
        if (attempt === 2) {
          throw new Error('ログインサーバーに接続できませんでした。ネット接続を確認し、もう一度ログインしてください。');
        }
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  async function loginViaGoogle(code, password) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch('https://script.google.com/macros/s/AKfycbypkUc0MqZ07E7pZRglNPeRM56WbCcuWaLpRzi9bVFcPklHDxaaLC7GfzG6ozTGCbEX/exec', {
        method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'},
        body:JSON.stringify({action:'staffLogin',code,password}), signal:controller.signal
      });
      const staff = await response.json();
      if (!response.ok || staff.success !== true) throw new Error(staff.error || '講師番号・パスワードを確認してください。');
      if (String(staff.permissionLevel) === '1') return request({action:'staffLogin',code,password});
      if (!['2','3','4'].includes(String(staff.permissionLevel)) || !staff.systemPortalSessionToken) throw new Error('利用できるログイン情報を取得できませんでした。');
      return staff;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Google側のログイン確認が時間切れになりました。');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  window.StepStaffAuth = {
    fetchRuntime,
    login: loginViaGoogle,
    verify: token => request({ action: 'verifyStaffSession', token }),
    persist: token => request({ action: 'persistAdminSession', token }),
    logout: token => request({ action: 'logoutAdmin', token }),
  };
})();
