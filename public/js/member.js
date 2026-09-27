/* Member page logic — vanilla JS */
(function () {
  'use strict';
  var C = window.Common;

  var user = C.guardPage('member');
  if (!user) return;

  if (window.CONFIG) {
    document.title = 'Member — ' + window.CONFIG.societyName;
    document.getElementById('society-name').textContent = window.CONFIG.societyName;
    document.getElementById('society-tagline').textContent = window.CONFIG.tagline || '';
    document.getElementById('society-name-foot').textContent = window.CONFIG.societyName;
  }
  document.getElementById('year').textContent = new Date().getFullYear();
  document.getElementById('logout-btn').addEventListener('click', C.logout);

  var CATEGORIES = [
    ['Lift', '🛗'], ['Electricity', '⚡'], ['Plumber', '🔧'],
    ['Cleaning', '🧹'], ['Security', '🛡️'], ['Parking', '🚗'],
    ['Sewerage', '🚰'], ['Water', '💧'],
    ['Repair & Maintenance', '🛠️'], ['Notice', '📢'], ['Other', '📌']
  ];

  function setAvatar(el, name, photoUrl) {
    el.innerHTML = '';
    if (photoUrl) {
      var img = document.createElement('img');
      img.src = photoUrl;
      img.alt = 'Profile photo';
      el.appendChild(img);
    } else {
      el.textContent = (name || '?').trim().charAt(0).toUpperCase() || '?';
    }
  }

  /* ---------- Profile header ---------- */
  function renderUser(u) {
    document.getElementById('header-name').textContent = u.name || u.username;
    setAvatar(document.getElementById('header-avatar'), u.name || u.username, u.profile_photo);
    setAvatar(document.getElementById('profile-avatar'), u.name || u.username, u.profile_photo);
    document.getElementById('profile-name').textContent = u.name || '—';
    document.getElementById('profile-flat').textContent = u.flat_no || '—';

    document.getElementById('must-change-banner').hidden = !u.must_change_password;

    if (u.email) {
      document.getElementById('email-locked').hidden = false;
      document.getElementById('email-locked').querySelector('#profile-email-locked').textContent = u.email;
      document.getElementById('email-form').hidden = true;
    } else {
      document.getElementById('email-locked').hidden = true;
      document.getElementById('email-form').hidden = false;
    }
  }

  function loadMe() {
    C.api('GET', '/api/member/me').then(function (data) {
      renderUser(data.user);
    }).catch(function () { renderUser(user); }); // fall back to token user
  }

  /* ---------- Balance ---------- */
  function loadBalance() {
    var msg = document.getElementById('balance-msg');
    C.api('GET', '/api/member/balance').then(function (d) {
      document.getElementById('bal-prev').textContent = C.fmtMoney(d.previous_balance);
      document.getElementById('bal-current').textContent = C.fmtMoney(d.current_month);
      document.getElementById('bal-total').textContent = C.fmtMoney(d.total_due);
    }).catch(function (err) {
      C.showMsg(msg, err.message, 'err');
    });
  }

  /* ---------- Complaint tiles + modal ---------- */
  var modal = document.getElementById('complaint-modal');
  var modalCategory = document.getElementById('modal-category');
  var currentCategory = '';
  var complaintMsg = document.getElementById('complaint-msg');

  var tilesEl = document.getElementById('complaint-tiles');
  CATEGORIES.forEach(function (pair) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile';
    var e = document.createElement('span');
    e.className = 'emoji';
    e.textContent = pair[1];
    var l = document.createElement('span');
    l.className = 'label';
    l.textContent = pair[0];
    btn.appendChild(e);
    btn.appendChild(l);
    btn.addEventListener('click', function () { openModal(pair[0]); });
    tilesEl.appendChild(btn);
  });

  function openModal(category) {
    currentCategory = category;
    modalCategory.textContent = category;
    document.getElementById('complaint-desc').value = '';
    C.showMsg(complaintMsg, '', 'err');
    modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; }
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

  document.getElementById('complaint-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var desc = document.getElementById('complaint-desc').value.trim();
    if (!desc) { C.showMsg(complaintMsg, 'Please describe the issue.', 'err'); return; }
    var btn = document.getElementById('complaint-btn');
    btn.disabled = true;
    C.api('POST', '/api/member/complaints', { category: currentCategory, description: desc })
      .then(function () {
        closeModal();
        C.showMsg(complaintMsg, '', 'err');
        alert('✅ Complaint registered successfully!');
        loadComplaints(currentTab);
        btn.disabled = false;
      })
      .catch(function (err) {
        C.showMsg(complaintMsg, err.message, 'err');
        btn.disabled = false;
      });
  });

  /* ---------- My complaints ---------- */
  var currentTab = 'Opening';
  var complaintsList = document.getElementById('complaints-list');
  var complaintsMsg = document.getElementById('complaints-msg');

  document.querySelectorAll('#my-complaints .tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#my-complaints .tab-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentTab = btn.getAttribute('data-status');
      loadComplaints(currentTab);
    });
  });

  function badge(status) {
    var span = document.createElement('span');
    span.className = 'badge badge-' + status.toLowerCase();
    span.textContent = status;
    return span;
  }

  function loadComplaints(status) {
    complaintsList.innerHTML = '<p class="empty">Loading…</p>';
    C.api('GET', '/api/member/complaints?status=' + encodeURIComponent(status))
      .then(function (d) {
        complaintsList.innerHTML = '';
        if (!d.items || !d.items.length) {
          complaintsList.innerHTML = '<p class="empty">No ' + C.esc(status.toLowerCase()) + ' complaints.</p>';
          return;
        }
        d.items.forEach(function (c) {
          var div = document.createElement('div');
          div.className = 'list-item';
          var h = document.createElement('h4');
          h.appendChild(document.createTextNode(c.category + ' '));
          h.appendChild(badge(c.status));
          div.appendChild(h);
          var p = document.createElement('p');
          p.textContent = c.description;
          div.appendChild(p);
          var m = document.createElement('p');
          m.className = 'meta';
          m.textContent = 'Raised on ' + C.fmtDate(c.created_at);
          div.appendChild(m);
          if (c.admin_response) {
            var r = document.createElement('div');
            r.className = 'admin-response';
            var b = document.createElement('strong');
            b.textContent = 'Admin response: ';
            r.appendChild(b);
            r.appendChild(document.createTextNode(c.admin_response));
            div.appendChild(r);
          }
          complaintsList.appendChild(div);
        });
      })
      .catch(function (err) {
        complaintsList.innerHTML = '';
        C.showMsg(complaintsMsg, err.message, 'err');
      });
  }

  /* ---------- Statements ---------- */
  function loadStatements() {
    var list = document.getElementById('statements-list');
    var msg = document.getElementById('statements-msg');
    list.innerHTML = '<p class="empty">Loading…</p>';
    C.api('GET', '/api/member/statements').then(function (d) {
      list.innerHTML = '';
      if (!d.items || !d.items.length) { list.innerHTML = '<p class="empty">No statements yet.</p>'; return; }
      d.items.forEach(function (s) {
        var div = document.createElement('div');
        div.className = 'list-item';
        var h = document.createElement('h4');
        h.textContent = s.month;
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
          a.textContent = 'View / Download';
          div.appendChild(a);
        }
        list.appendChild(div);
      });
    }).catch(function (err) { list.innerHTML = ''; C.showMsg(msg, err.message, 'err'); });
  }

  /* ---------- Notices ---------- */
  function loadNotices() {
    var list = document.getElementById('notices-list');
    var msg = document.getElementById('notices-msg');
    list.innerHTML = '<p class="empty">Loading…</p>';
    C.api('GET', '/api/member/notices').then(function (d) {
      list.innerHTML = '';
      if (!d.items || !d.items.length) { list.innerHTML = '<p class="empty">No notices yet.</p>'; return; }
      d.items.forEach(function (n) {
        var div = document.createElement('div');
        div.className = 'list-item';
        var h = document.createElement('h4');
        h.textContent = n.title;
        div.appendChild(h);
        var p = document.createElement('p');
        p.textContent = n.body;
        div.appendChild(p);
        var m = document.createElement('p');
        m.className = 'meta';
        m.textContent = C.fmtDate(n.created_at);
        div.appendChild(m);
        list.appendChild(div);
      });
    }).catch(function (err) { list.innerHTML = ''; C.showMsg(msg, err.message, 'err'); });
  }

  /* ---------- Feedback ---------- */
  function loadFeedback() {
    var list = document.getElementById('feedback-list');
    list.innerHTML = '<p class="empty">Loading…</p>';
    C.api('GET', '/api/member/feedback').then(function (d) {
      list.innerHTML = '';
      if (!d.items || !d.items.length) { list.innerHTML = '<p class="empty">No feedback yet.</p>'; return; }
      d.items.forEach(function (f) {
        var div = document.createElement('div');
        div.className = 'list-item';
        var p = document.createElement('p');
        p.textContent = f.message;
        div.appendChild(p);
        var m = document.createElement('p');
        m.className = 'meta';
        m.textContent = C.fmtDate(f.created_at);
        div.appendChild(m);
        list.appendChild(div);
      });
    }).catch(function () { list.innerHTML = '<p class="empty">Could not load feedback.</p>'; });
  }

  var feedbackMsg = document.getElementById('feedback-msg');
  document.getElementById('feedback-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = document.getElementById('feedback-text').value.trim();
    if (!text) { C.showMsg(feedbackMsg, 'Please write your feedback first.', 'err'); return; }
    var btn = document.getElementById('feedback-btn');
    btn.disabled = true;
    C.api('POST', '/api/member/feedback', { message: text }).then(function () {
      document.getElementById('feedback-text').value = '';
      C.showMsg(feedbackMsg, 'Thank you! Your feedback has been submitted.', 'success');
      loadFeedback();
      btn.disabled = false;
    }).catch(function (err) {
      C.showMsg(feedbackMsg, err.message, 'err');
      btn.disabled = false;
    });
  });

  /* ---------- Profile: photo ---------- */
  var photoMsg = document.getElementById('photo-msg');
  document.getElementById('photo-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var file = document.getElementById('photo-input').files[0];
    if (!file) { C.showMsg(photoMsg, 'Please choose a photo first.', 'err'); return; }
    var btn = document.getElementById('photo-btn');
    btn.disabled = true;
    var fd = new FormData();
    fd.append('photo', file);
    C.api('PUT', '/api/member/profile', fd).then(function (d) {
      C.showMsg(photoMsg, 'Photo updated.', 'success');
      loadMe();
      btn.disabled = false;
    }).catch(function (err) {
      C.showMsg(photoMsg, err.message, 'err');
      btn.disabled = false;
    });
  });

  /* ---------- Profile: email (one-time) ---------- */
  var emailMsg = document.getElementById('email-msg');
  document.getElementById('email-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('email-input').value.trim();
    if (!email) { C.showMsg(emailMsg, 'Please enter your email.', 'err'); return; }
    if (!confirm('This email will be linked permanently and cannot be changed. Continue?')) return;
    var btn = document.getElementById('email-btn');
    btn.disabled = true;
    C.api('POST', '/api/member/set-email', { email: email }).then(function (d) {
      C.showMsg(emailMsg, d.message || 'Email linked successfully.', 'success');
      loadMe();
      btn.disabled = false;
    }).catch(function (err) {
      C.showMsg(emailMsg, err.message, 'err');
      btn.disabled = false;
    });
  });

  /* ---------- Profile: change password ---------- */
  var passwordMsg = document.getElementById('password-msg');
  document.getElementById('password-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var oldP = document.getElementById('old-password').value;
    var newP = document.getElementById('new-password').value;
    var conf = document.getElementById('confirm-password').value;
    if (newP !== conf) { C.showMsg(passwordMsg, 'New passwords do not match.', 'err'); return; }
    var btn = document.getElementById('password-btn');
    btn.disabled = true;
    C.api('PUT', '/api/member/password', { oldPassword: oldP, newPassword: newP }).then(function () {
      C.showMsg(passwordMsg, 'Password changed successfully.', 'success');
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = '';
      loadMe();
      btn.disabled = false;
    }).catch(function (err) {
      C.showMsg(passwordMsg, err.message, 'err');
      btn.disabled = false;
    });
  });

  /* ---------- init ---------- */
  loadMe();
  loadBalance();
  loadComplaints(currentTab);
  loadStatements();
  loadNotices();
  loadFeedback();
})();
