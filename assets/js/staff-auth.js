// Shared authentication client. Authorization remains on the server.
(function () {
  'use strict';
  const endpoint = 'https://wisedgcgwaebtkprdhth.supabase.co/functions/v1/seiseki-admin-runtime-v1';
  async function request(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload), cache: 'no-store', signal: controller.signal,
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
  window.StepStaffAuth = {
    login: (code, password) => request({ action: 'staffLogin', code, password }),
    verify: token => request({ action: 'verifyStaffSession', token }),
    persist: token => request({ action: 'persistAdminSession', token }),
    logout: token => request({ action: 'logoutAdmin', token }),
  };
})();
