/* Admin page logic — vanilla JS */
(function () {
  'use strict';
  var C = window.Common;

  var user = C.guardPage('admin');
  if (!user) return;

  if (window.CONFIG) {
    document.title = 'Admin Panel — ' + window.CONFIG.societyName;
    document.getElementById('society-name').textContent = window.CONFIG.societyName;
    document.getElementById('society-name-foot').textContent = window.CONFIG.societyName;
  }
  document.getElementById('year').textContent = new Date().getFullYear();
  document.getElementById('header-name').textContent = user.name || user.username;
  document.getElementById('logout-btn').addEventListener('click', C.logout);

  var membersCache = [];

  /* ---------- Tabs ---------- */
  var tabBtns = document.querySelectorAll('#admin-tabs .tab-btn');
  tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var name = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      document.getElementById('panel-' + name).classList.add('active');
      if (name === 'complaints') loadComplaints();
      if (name === 'notices') loadNotices();
      if (name === 'statements') { loadStatements(); fillMemberDropdown(); }
      if (name === 'feedback') loadFeedback();
      if (name === 'reset') loadResetRequests();
    });
  });

  /* ---------- Members ---------- */
  var membersTbody = document.getElementById('members-tbody');
  var membersMsg = document.getElementById('members-msg');

  function loadMembers() {
    membersTbody.innerHTML = '<tr><td colspan="8">Loading…</td></tr>';
    C.api('GET', '/api/admin/members').then(function (d) {
      membersCache = d.items || [];
      membersTbody.innerHTML = '';
      if (!membersCache.length) {
        membersTbody.innerHTML = '<tr><td colspan="8">No members yet.</td></tr>';
        return;
      }
      membersCache.forEach(function (m) {
        var tr = document.createElement('tr');

        tr.appendChild(td(m.username));
        tr.appendChild(td(m.name));
        tr.appendChild(td(m.flat_no));
        tr.appendChild(td(C.fmtMoney(m.previous_balance)));
        tr.appendChild(td(C.fmtMoney(m.current_month)));
        tr.appendChild(td(C.fmtMoney(m.total_due)));

        var statusTd = document.createElement('td');
        var badge = document.createElement('span');
        badge.className = 'badge ' + (m.active ? 'badge-active' : 'badge-inactive');
        badge.textContent = m.active ? 'Active' : 'Inactive';
        statusTd.appendChild(badge);
        tr.appendChild(statusTd);

        var actTd = document.createElement('td');
        var actions = document.createElement('div');
        actions.className = 'row-actions';

        var editBtn = document.createElement('button');
        editBtn.type = 'button'; editBtn.className = 'btn btn-sm'; editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', function () { editMember(m); });

        var balBtn = document.createElement('button');
        balBtn.type = 'button'; balBtn.className = 'btn btn-sm'; balBtn.textContent = 'Set Balance';
        balBtn.addEventListener('click', function () { setBalance(m); });

        var pwBtn = document.createElement('button');
        pwBtn.type = 'button'; pwBtn.className = 'btn btn-sm'; pwBtn.textContent = 'Reset PW';
        pwBtn.addEventListener('click', function () { resetPassword(m); });

        var toggleBtn = document.createElement('button');
        toggleBtn.type = 'button'; toggleBtn.className = 'btn btn-sm';
        toggleBtn.textContent = m.active ? 'Deactivate' : 'Activate';
        toggleBtn.addEventListener('click', function () { toggleActive(m); });

        [editBtn, balBtn, pwBtn, toggleBtn].forEach(function (b) { actions.appendChild(b); });
        actTd.appendChild(actions);
        tr.appendChild(actTd);

        membersTbody.appendChild(tr);
      });
      fillMemberDropdown();
    }).catch(function (err) {
      membersTbody.innerHTML = '<tr><td colspan="8"></td></tr>';
      C.showMsg(membersMsg, err.message, 'err');
    });
  }

  function td(text) {
    var c = document.createElement('td');
    c.textContent = text == null ? '' : String(text);
    return c;
  }

  document.getElementById('add-member-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = document.getElementById('am-btn');
    btn.disabled = true;
    C.showMsg(membersMsg, '', 'err');
    C.api('POST', '/api/admin/members', {
      username: document.getElementById('am-username').value.trim(),
      tempPassword: document.getElementById('am-password').value,
      name: document.getElementById('am-name').value.trim(),
      flat_no: document.getElementById('am-flat').value.trim()
    }).then(function () {
      C.showMsg(membersMsg, 'Member added successfully.', 'success');
      document.getElementById('add-member-form').reset();
      loadMembers();
      btn.disabled = false;
    }).catch(function (err) {
      C.showMsg(membersMsg, err.message, 'err');
      btn.disabled = false;
    });
  });

  function editMember(m) {
    var name = prompt('Name:', m.name || '');
    if (name === null) return;
    var flat = prompt('Flat no:', m.flat_no || '');
    if (flat === null) return;
    C.api('PUT', '/api/admin/members/' + m.id, { name: name.trim(), flat_no: flat.trim(), active: m.active })
      .then(function () { C.showMsg(membersMsg, 'Member updated.', 'success'); loadMembers(); })
      .catch(function (err) { C.showMsg(membersMsg, err.message, 'err'); });
  }

  function setBalance(m) {
    var prev = prompt('Previous balance for ' + (m.name || m.username) + ':', m.previous_balance || 0);
    if (prev === null) return;
    var curr = prompt('Current month due:', m.current_month || 0);
    if (curr === null) return;
    prev = Number(prev); curr = Number(curr);
    if (isNaN(prev) || isNaN(curr)) { C.showMsg(membersMsg, 'Please enter valid numbers.', 'err'); return; }
    C.api('POST', '/api/admin/members/' + m.id + '/balance', { previous_balance: prev, current_month: curr })
      .then(function () { C.showMsg(membersMsg, 'Balance updated.', 'success'); loadMembers(); })
      .catch(function (err) { C.showMsg(membersMsg, err.message, 'err'); });
  }

  function resetPassword(m) {
    var pw = prompt('New password for ' + (m.name || m.username) + ':');
    if (pw === null || pw === '') return;
    C.api('PUT', '/api/admin/members/' + m.id + '/password', { newPassword: pw })
      .then(function () { C.showMsg(membersMsg, 'Password reset successfully.', 'success'); })
      .catch(function (err) { C.showMsg(membersMsg, err.message, 'err'); });
  }

  function toggleActive(m) {
    var action = m.active ? 'deactivate' : 'activate';
    if (!confirm('Are you sure you want to ' + action + ' ' + (m.name || m.username) + '?')) return;
    C.api('PUT', '/api/admin/members/' + m.id, { name: m.name, flat_no: m.flat_no, active: !m.active })
      .then(function () { C.showMsg(membersMsg, 'Member ' + (m.active ? 'deactivated' : 'activated') + '.', 'success'); loadMembers(); })
      .catch(function (err) { C.showMsg(membersMsg, err.message, 'err'); });
  }

  /* ---------- Complaints ---------- */
  var complaintsList = document.getElementById('admin-complaints-list');
  var complaintsMsg = document.getElementById('admin-complaints-msg');

  document.getElementById('complaint-filter').addEventListener('change', loadComplaints);

  function loadComplaints() {
    var status = document.getElementById('complaint-filter').value;
    complaintsList.innerHTML = '<p class="empty">Loading…</p>';
    C.showMsg(complaintsMsg, '', 'err');
    var path = '/api/admin/complaints' + (status ? '?status=' + encodeURIComponent(status) : '');
    C.api('GET', path).then(function (d) {
      complaintsList.innerHTML = '';
      var items = d.items || [];
      if (!items.length) { complaintsList.innerHTML = '<p class="empty">No complaints found.</p>'; return; }
      items.forEach(function (c) {
        var div = document.createElement('div');
        div.className = 'list-item';

        var h = document.createElement('h4');
        h.textContent = (c.user_name || 'Member') + (c.flat_no ? ' (Flat ' + c.flat_no + ')' : '') + ' — ' + c.category + ' ';
        var badge = document.createElement('span');
        badge.className = 'badge badge-' + String(c.status).toLowerCase();
        badge.textContent = c.status;
        h.appendChild(badge);
        div.appendChild(h);

        var p = document.createElement('p');
        p.textContent = c.description;
        div.appendChild(p);

        var m = document.createElement('p');
        m.className = 'meta';
        m.textContent = C.fmtDate(c.created_at);
        div.appendChild(m);

        var form = document.createElement('div');
        var statusLbl = document.createElement('label');
        statusLbl.textContent = 'Status';
        var sel = document.createElement('select');
        ['Opening', 'Pending', 'Closed'].forEach(function (s) {
          var opt = document.createElement('option');
          opt.value = s; opt.textContent = s;
          if (s === c.status) opt.selected = true;
          sel.appendChild(opt);
        });
        var respLbl = document.createElement('label');
        respLbl.textContent = 'Admin response';
        var ta = document.createElement('textarea');
        ta.value = c.admin_response || '';
        ta.placeholder = 'Write a response for the member...';
        var saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-sm';
        saveBtn.textContent = 'Save';
        saveBtn.style.marginTop = '8px';
        saveBtn.addEventListener('click', function () {
          saveBtn.disabled = true;
          C.showMsg(complaintsMsg, '', 'err');
          C.api('PUT', '/api/admin/complaints/' + c.id, { status: sel.value, admin_response: ta.value })
            .then(function () { C.showMsg(complaintsMsg, 'Complaint updated.', 'success'); loadComplaints(); })
            .catch(function (err) { C.showMsg(complaintsMsg, err.message, 'err'); saveBtn.disabled = false; });
        });
        form.appendChild(statusLbl);
        form.appendChild(sel);
        form.appendChild(respLbl);
        form.appendChild(ta);
        form.appendChild(saveBtn);
        div.appendChild(form);

        complaintsList.appendChild(div);
      });
    }).catch(function (err) {
      complaintsList.innerHTML = '';
      C.showMsg(complaintsMsg, err.message, 'err');
    });
  }

  /* ---------- Notices ---------- */
  var noticesList = document.getElementById('admin-notices-list');
  var noticesMsg = document.getElementById('notices-msg');

  function loadNotices() {
    noticesList.innerHTML = '<p class="empty">Loading…</p>';
    C.api('GET', '/api/admin/notices').then(function (d) {
      noticesList.innerHTML = '';
      var items = d.items || [];
      if (!items.length) { noticesList.innerHTML = '<p class="empty">No notices yet.</p>'; return; }
      items.forEach(function (n) {
        var div = document.createElement('div');
        div.className = 'list-item';
        var h = document.createElement('h4');
        h.textContent = n.title;
        div.appendChild(h);
        var p = document.createElement('p');
        p.textContent = n.body;
        div.appendChild(p);
        var meta = document.createElement('p');
        meta.className = 'meta';
        meta.textContent = C.fmtDate(n.created_at);
        div.appendChild(meta);
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn-danger btn-sm';
        del.textContent = 'Delete';
        del.addEventListener('click', function () {
          if (!confirm('Delete this notice?')) return;
          C.api('DELETE', '/api/admin/notices/' + n.id)
            .then(function () { C.showMsg(noticesMsg, 'Notice deleted.', 'success'); loadNotices(); })
            .catch(function (err) { C.showMsg(noticesMsg, err.message, 'err'); });
        });
        div.appendChild(del);
        noticesList.appendChild(div);
      });
    }).catch(function (err) {
      noticesList.innerHTML = '';
      C.showMsg(noticesMsg, err.message, 'err');
    });
  }

  document.getElementById('add-notice-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = document.getElementById('notice-btn');
    btn.disabled = true;
    C.showMsg(noticesMsg, '', 'err');
    C.api('POST', '/api/admin/notices', {
      title: document.getElementById('notice-title').value.trim(),
      body: document.getElementById('notice-body').value.trim()
    }).then(function () {
      C.showMsg(noticesMsg, 'Notice published.', 'success');
      document.getElementById('add-notice-form').reset();
      loadNotices();
      btn.disabled = false;
    }).catch(function (err) {
      C.showMsg(noticesMsg, err.message, 'err');
      btn.disabled = false;
    });
  });

  /* ---------- Statements ---------- */
  var statementsList = document.getElementById('admin-statements-list');
  var statementsMsg = document.getElementById('statements-msg');

  function fillMemberDropdown() {
    var sel = document.getElementById('st-member');
    var current = sel.value;
    sel.innerHTML = '<option value="">— Select member —</option>';
    membersCache
      .filter(function (m) { return m.role === 'member' || !m.role; })
      .forEach(function (m) {
        var opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = (m.name || m.username) + (m.flat_no ? ' (Flat ' + m.flat_no + ')' : '');
        sel.appendChild(opt);
      });
    if (current) sel.value = current;
  }

  function loadStatements() {
    statementsList.innerHTML = '<p class="empty">Loading…</p>';
    C.api('GET', '/api/admin/statements').then(function (d) {
      statementsList.innerHTML = '';
      var items = d.items || [];
      if (!items.length) { statementsList.innerHTML = '<p class="empty">No statements yet.</p>'; return; }
      items.forEach(function (s) {
        var div = document.createElement('div');
        div.className = 'list-item';
        var h = document.createElement('h4');
        h.textContent = (s.user_name || 'Member') + (s.flat_no ? ' (Flat ' + s.flat_no + ')' : '') + ' — ' + s.month;
        div.appendChild(h);
        var p = document.createElement('p');
        p.textContent = 'Amount: ' + C.fmtMoney(s.amount);
        div.appendChild(p);
        if (s.file_url) {
          var a = document.createElement('a');
          a.href = s.file_url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.className = 'btn btn-sm';
          a.textContent = 'View';
          div.appendChild(a);
        }
        statementsList.appendChild(div);
      });
    }).catch(function (err) {
      statementsList.innerHTML = '';
      C.showMsg(statementsMsg, err.message, 'err');
    });
  }

  document.getElementById('upload-statement-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var file = document.getElementById('st-file').files[0];
    if (!file) { C.showMsg(statementsMsg, 'Please choose a PDF file.', 'err'); return; }
    var btn = document.getElementById('st-btn');
    btn.disabled = true;
    C.showMsg(statementsMsg, '', 'err');
    var fd = new FormData();
    fd.append('file', file);
    fd.append('user_id', document.getElementById('st-member').value);
    fd.append('month', document.getElementById('st-month').value);
    fd.append('amount', document.getElementById('st-amount').value);
    C.api('POST', '/api/admin/statements', fd).then(function () {
      C.showMsg(statementsMsg, 'Statement uploaded.', 'success');
      document.getElementById('upload-statement-form').reset();
      fillMemberDropdown();
      loadStatements();
      btn.disabled = false;
    }).catch(function (err) {
      C.showMsg(statementsMsg, err.message, 'err');
      btn.disabled = false;
    });
  });

  /* ---------- Feedback ---------- */
  var feedbackList = document.getElementById('admin-feedback-list');
  var feedbackMsg = document.getElementById('feedback-msg');

  function loadFeedback() {
    feedbackList.innerHTML = '<p class="empty">Loading…</p>';
    C.api('GET', '/api/admin/feedback').then(function (d) {
      feedbackList.innerHTML = '';
      var items = d.items || [];
      if (!items.length) { feedbackList.innerHTML = '<p class="empty">No feedback yet.</p>'; return; }
      items.forEach(function (f) {
        var div = document.createElement('div');
        div.className = 'list-item';
        var h = document.createElement('h4');
        h.textContent = (f.user_name || 'Member') + (f.flat_no ? ' (Flat ' + f.flat_no + ')' : '');
        div.appendChild(h);
        var p = document.createElement('p');
        p.textContent = f.message;
        div.appendChild(p);
        var m = document.createElement('p');
        m.className = 'meta';
        m.textContent = C.fmtDate(f.created_at);
        div.appendChild(m);
        feedbackList.appendChild(div);
      });
    }).catch(function (err) {
      feedbackList.innerHTML = '';
      C.showMsg(feedbackMsg, err.message, 'err');
    });
  }

  /* ---------- Reset requests ---------- */
  var resetTbody = document.getElementById('reset-tbody');
  var resetMsg = document.getElementById('reset-msg');

  function loadResetRequests() {
    resetTbody.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';
    C.api('GET', '/api/admin/reset-requests').then(function (d) {
      resetTbody.innerHTML = '';
      var items = d.items || [];
      if (!items.length) {
        resetTbody.innerHTML = '<tr><td colspan="4"><p class="empty">No pending reset requests.</p></td></tr>';
        return;
      }
      items.forEach(function (r) {
        var tr = document.createElement('tr');
        tr.appendChild(td(r.username));
        tr.appendChild(td(C.fmtDate(r.created_at)));
        tr.appendChild(td(C.fmtDate(r.expires_at)));

        var act = document.createElement('td');
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn btn-sm';
        copyBtn.textContent = 'Copy reset link';
        copyBtn.addEventListener('click', function () {
          var link = window.location.origin + '/index.html?reset=' + encodeURIComponent(r.token);
          function done() { C.showMsg(resetMsg, 'Reset link copied to clipboard.', 'success'); }
          function fail() {
            C.showMsg(resetMsg, '', 'err');
            prompt('Copy the reset link:', link);
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(done, fail);
          } else {
            fail();
          }
        });
        act.appendChild(copyBtn);
        tr.appendChild(act);
        resetTbody.appendChild(tr);
      });
    }).catch(function (err) {
      resetTbody.innerHTML = '<tr><td colspan="4"></td></tr>';
      C.showMsg(resetMsg, err.message, 'err');
    });
  }

  /* ---------- init ---------- */
  loadMembers();
})();
