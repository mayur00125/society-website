/* Shared frontend helpers — vanilla JS */
(function () {
  'use strict';

  function getToken() {
    try { return localStorage.getItem('sw_token'); } catch (e) { return null; }
  }

  function api(method, path, body) {
    var headers = {};
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var opts = { method: method, headers: headers };
    if (body instanceof FormData) {
      opts.body = body; // send as-is, no Content-Type
    } else if (body !== undefined && body !== null) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    return fetch(path, opts).then(function (res) {
      if (res.status === 401) {
        try { localStorage.removeItem('sw_token'); localStorage.removeItem('sw_user'); } catch (e) {}
        window.location.href = '/index.html';
        var err = new Error('Session expired. Please log in again.');
        err.status = 401;
        throw err;
      }
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
        }
        return data;
      });
    });
  }

  function saveAuth(token, user) {
    try {
      localStorage.setItem('sw_token', token);
      localStorage.setItem('sw_user', JSON.stringify(user));
    } catch (e) {}
  }

  function getUser() {
    try {
      var raw = localStorage.getItem('sw_user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function logout() {
    try {
      localStorage.removeItem('sw_token');
      localStorage.removeItem('sw_user');
    } catch (e) {}
    window.location.href = '/index.html';
  }

  // role: 'admin' | 'member'
  function guardPage(role) {
    var token = getToken();
    var user = getUser();
    if (!token || !user) { window.location.href = '/index.html'; return null; }
    if (user.role !== role) {
      window.location.href = (user.role === 'admin') ? '/admin.html' : '/member.html';
      return null;
    }
    return user;
  }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showMsg(el, text, type) {
    if (!el) return;
    el.className = 'msg ' + (type === 'success' ? 'msg-ok' : 'msg-err');
    el.textContent = text || '';
    el.hidden = !text;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtMoney(n) {
    var v = Number(n) || 0;
    return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  window.Common = {
    api: api, saveAuth: saveAuth, getUser: getUser, logout: logout,
    guardPage: guardPage, esc: esc, showMsg: showMsg,
    fmtDate: fmtDate, fmtMoney: fmtMoney
  };
})();
