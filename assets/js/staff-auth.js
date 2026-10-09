// Shared authentication client. Authorization remains on the server.
(function () {
  'use strict';
  const endpoint = 'https://wisedgcgwaebtkprdhth.supabase.co/functions/v1/seiseki-admin-runtime-v1';
  async function requestOnce(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ ...payload, permissionAppId: /student_directory/.test(location.pathname) ? 'student-directory' : /meeting_memo|classroom_reports/.test(location.pathname) ? 'public-13' : 'public-12' }), cache: 'no-store', signal: controller.signal,
      });
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
  window.StepStaffAuth = {
    login: (code, password) => request({ action: 'staffLogin', code, password }),
    verify: token => request({ action: 'verifyStaffSession', token }),
    persist: token => request({ action: 'persistAdminSession', token }),
    logout: token => request({ action: 'logoutAdmin', token }),
  };
})();
