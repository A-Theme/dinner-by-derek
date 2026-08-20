/* Dashboard behaviour. Designed for one thumb on a phone in a kitchen. */
(function () {
  'use strict';

  /* --- Toasts: nothing succeeds silently -------------------------------- */
  function toast(msg, kind) {
    var el = document.createElement('div');
    el.className = 'toast toast--' + (kind === 'bad' ? 'bad' : 'ok');
    el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, kind === 'bad' ? 7000 : 6000);
  }
  window.dbdToast = toast;

  /* --- One broken section is not all of them ----------------------------
   * Everything below runs at load, in order, in one function. A throw
   * anywhere in it stops every section after that point from ever being
   * wired up — so a mistake in the photo uploader would silently take the
   * autosave with it, and the page would look completely normal while half
   * its behaviour was missing. That is the shape of the two failures this
   * dashboard has already had: a control that does nothing, quietly.
   *
   * Each section runs inside this instead. A failure is confined to the one
   * that broke, it says so on screen rather than only in a console nobody
   * has open, and the rest of the page still works.
   */
  function section(name, run) {
    try {
      run();
    } catch (e) {
      if (window.console && console.error) console.error("[admin] " + name + " failed", e);
      try {
        toast(name + " isn't working on this page. Reload — if it keeps happening, "
          + "that part of the dashboard needs fixing.", "bad");
      } catch (ignored) { /* even the toast host is gone; the console has it */ }
    }
  }

  section("Printing", function () {
    /* --- Print sheets ------------------------------------------------------
       A kitchen or pickup sheet is opened to be printed, so it offers the
       dialog itself, once, shortly after load — late enough that the page has
       drawn. The button asks again for anyone who cancelled. */
    if (document.querySelector('.sheet[data-autoprint]')) {
      window.addEventListener('load', function () {
        setTimeout(function () { window.print(); }, 400);
      });
    }
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-print]')) window.print();
    });
  });

  section("The copy buttons", function () {
    /* --- Copy buttons ------------------------------------------------------
       One listener for every [data-copy] on the page. These used to be inline
       onclick attributes, which is the one thing a page cannot allow if it also
       wants to tell the browser to refuse inline script. */
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-copy]');
      if (!btn) return;
      var text = btn.getAttribute('data-copy');
      var said = btn.getAttribute('data-copied') || 'Copied.';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(function () { toast(said); })
          .catch(function () { toast('Could not copy. Long-press the link instead.', 'bad'); });
      } else {
        toast('Could not copy. Long-press the link instead.', 'bad');
      }
    });

  });

  section("The saved/failed message", function () {
    /* The sentence a redirect carried in the query string, shown once and
       then wiped out of the address bar so a reload does not repeat it. */
    var params = new URLSearchParams(location.search);
    if (params.get('ok')) toast(decodeURIComponent(params.get('ok')), 'ok');
    if (params.get('err')) toast(decodeURIComponent(params.get('err')), 'bad');
    if (params.get('ok') || params.get('err')) {
      params.delete('ok'); params.delete('err');
      history.replaceState({}, '', location.pathname + (params.toString() ? '?' + params : ''));
    }
  });

  section("The confirmation step", function () {
    /* --- Confirms name exactly what will happen ---------------------------
     * These used to be window.confirm(), which browsers are entitled to stop
     * showing: after a few dialogs in a row Chrome and Edge offer "prevent this
     * page from creating additional dialogs", and once that is ticked confirm()
     * returns false immediately, for the rest of the session, without asking
     * anyone. preventDefault() then ran on every submit — so Save did nothing at
     * all, silently, every time, and the only way to discover why was to know
     * that box existed. A price edit that will not save and will not say why is
     * indistinguishable from a broken app.
     *
     * A <dialog> cannot be suppressed, and the browser still handles the focus
     * trap, the backdrop and Escape. window.confirm stays as the fallback for
     * anything too old to have showModal.
     */
    var confirmDialog = null;
    function askToConfirm(message, onYes) {
      if (!window.HTMLDialogElement || !document.createElement('dialog').showModal) {
        if (window.confirm(message)) onYes();
        return;
      }
      if (!confirmDialog) {
        confirmDialog = document.createElement('dialog');
        confirmDialog.className = 'review';
        confirmDialog.setAttribute('aria-labelledby', 'confirm-title');
        var h = document.createElement('h2');
        h.id = 'confirm-title';
        h.textContent = 'Just checking';
        var p = document.createElement('p');
        p.id = 'confirm-message';
        var actions = document.createElement('div');
        actions.className = 'review__actions';
        var no = document.createElement('button');
        no.type = 'button';
        no.className = 'btn btn--secondary';
        no.textContent = 'Cancel';
        var yes = document.createElement('button');
        yes.type = 'button';
        yes.className = 'btn btn--primary';
        yes.textContent = 'Yes, go ahead';
        actions.appendChild(no);
        actions.appendChild(yes);
        confirmDialog.appendChild(h);
        confirmDialog.appendChild(p);
        confirmDialog.appendChild(actions);
        document.body.appendChild(confirmDialog);
        no.addEventListener('click', function () { confirmDialog.close(); });
        yes.addEventListener('click', function () {
          var run = confirmDialog.__onYes;
          confirmDialog.close();
          if (run) run();
        });
      }
      confirmDialog.querySelector('#confirm-message').textContent = message;
      confirmDialog.__onYes = onYes;
      confirmDialog.showModal();
    }

    document.querySelectorAll('[data-confirm]').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        // Set just before we re-submit on the owner's behalf, so this handler
        // steps out of the way exactly once.
        if (f.dataset.confirmed === '1') { delete f.dataset.confirmed; return; }
        e.preventDefault();
        // Which button was pressed matters: some of these forms carry more than
        // one, and its name and value are part of the submission.
        var submitter = e.submitter || null;
        askToConfirm(f.dataset.confirm, function () {
          f.dataset.confirmed = '1';
          if (f.requestSubmit) f.requestSubmit(submitter);
          else f.submit();
        });
      });
    });
  });

  section("The cutoff countdown", function () {
    /* --- Live cutoff countdown -------------------------------------------- */
    document.querySelectorAll('[data-countdown]').forEach(function (el) {
      var target = new Date(el.dataset.countdown).getTime();
      function tick() {
        var ms = target - Date.now();
        if (ms <= 0) { el.textContent = 'closed'; return; }
        var h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
        el.textContent = (h > 0 ? h + 'h ' : '') + m + 'm ' + s + 's';
        setTimeout(tick, 1000);
      }
      tick();
    });
  });

  section("The allergen suggestions", function () {
    /* --- Allergen suggestions --------------------------------------------- */
    document.querySelectorAll('[data-editor]').forEach(function (ed) {
      var desc = ed.querySelector('[data-description]');
      var nameEl = ed.querySelector('[data-item-name]');
      var box = ed.querySelector('[data-suggestions]');
      var list = ed.querySelector('[data-sugg-list]');
      var tags = ed.querySelector('[data-tags]');
      var hiddenA = ed.querySelector('[data-allergens]');
      var hiddenD = ed.querySelector('[data-dismissed]');
      var ack = ed.querySelector('[data-ack]');
      var timer = null;

      function accepted() { try { return JSON.parse(hiddenA.value || '[]'); } catch (e) { return []; } }
      function dismissed() { try { return JSON.parse(hiddenD.value || '[]'); } catch (e) { return []; } }

      /** Mirrors reviewedText() on the server. Both halves, both trimmed. */
      function reviewedText() {
        return (nameEl ? nameEl.value : '').trim() + '\n' + (desc ? desc.value : '').trim();
      }

      function renderTags() {
        tags.innerHTML = '';
        accepted().forEach(function (a) {
          var s = document.createElement('span');
          s.className = 'tag';
          s.textContent = a + ' ';
          var b = document.createElement('button');
          b.type = 'button'; b.textContent = '✕';
          b.setAttribute('aria-label', 'Remove ' + a);
          b.addEventListener('click', function () {
            hiddenA.value = JSON.stringify(accepted().filter(function (x) { return x !== a; }));
            renderTags(); suggest();
          });
          s.appendChild(b);
          tags.appendChild(s);
        });
      }

      function suggest() {
        if (!desc) return;
        fetch('/admin/api/suggest', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: nameEl ? nameEl.value : '',
            description: desc.value, accepted: accepted(), dismissed: dismissed(),
          }),
        }).then(function (r) { return r.json(); }).then(function (d) {
          list.innerHTML = '';
          /* Anything other than a list of suggestions is not a list of
             suggestions. A 401 from an expired session answers {error:...},
             and reading .length off that threw inside the promise — so the
             chips simply stopped appearing, with nothing said and nothing in
             the console the owner would ever look at. */
          if (!d || !Array.isArray(d.pending)) {
            box.hidden = true;
            if (d && d.error) toast(d.error, 'bad');
            return;
          }
          box.hidden = !d.pending.length;
          d.pending.forEach(function (p) {
            var w = document.createElement('span');
            w.className = 'sugg';
            /* Built as nodes, not as a string. The allergen and its matched
               terms come from the dictionary, which the owner edits and a
               restored backup can rewrite — so they are content, and content
               goes in through textContent. The page's CSP would stop a script
               either way; markup that rearranges the editor it sits in is
               reason enough on its own. */
            var chip = document.createElement('span');
            chip.textContent = p.allergen + ' ';
            var terms = document.createElement('span');
            terms.style.opacity = '.7';
            terms.textContent = '(' + p.terms.join(', ') + ')';
            chip.appendChild(terms);
            w.appendChild(chip);
            var yes = document.createElement('button');
            yes.type = 'button'; yes.dataset.accept = '1'; yes.textContent = '✓';
            yes.setAttribute('aria-label', 'Accept ' + p.allergen);
            yes.addEventListener('click', function () {
              var a = accepted(); a.push(p.allergen);
              hiddenA.value = JSON.stringify(a);
              renderTags(); suggest();
            });
            var no = document.createElement('button');
            no.type = 'button'; no.textContent = '✕';
            no.setAttribute('aria-label', 'Dismiss ' + p.allergen);
            no.addEventListener('click', function () {
              var d2 = dismissed(); d2.push(p.allergen);
              hiddenD.value = JSON.stringify(d2);
              suggest();
            });
            w.appendChild(yes); w.appendChild(no);
            list.appendChild(w);
          });
        }).catch(function () { /* suggestions are advisory; silence is fine */ });
      }

      if (desc) {
        // Editing either half invalidates a previous review, because the
        // suggestions are read from both. Renaming "Chicken Pie" to "Salmon Pie"
        // has to reopen the review exactly as rewriting the description does.
        var edited = function (what) {
          return function () {
            clearTimeout(timer);
            timer = setTimeout(suggest, 400);
            if (ack && ack.checked && reviewedText() !== desc.dataset.ackOf) {
              ack.checked = false;
              toast(what + ' changed — please review the allergens again.', 'bad');
            }
          };
        };
        desc.addEventListener('input', edited('Description'));
        if (nameEl) nameEl.addEventListener('input', edited('Name'));
        suggest();
      }

      var add = ed.querySelector('[data-add-allergen]');
      if (add) {
        add.addEventListener('change', function () {
          if (!add.value) return;
          var a = accepted();
          if (a.indexOf(add.value) === -1) a.push(add.value);
          hiddenA.value = JSON.stringify(a);
          add.value = '';
          renderTags(); suggest();
        });
      }
      renderTags();

      /* --- Photo upload --------------------------------------------------- */
      var drop = ed.querySelector('[data-drop]');
      if (drop) {
        var file = ed.querySelector('[data-file]');
        var cam = ed.querySelector('[data-camera]');
        var photo = ed.querySelector('[data-photo]');
        var bar = drop.querySelector('.progress');
        var fill = bar.querySelector('div');
        var msg = drop.querySelector('.dz-msg');

        function setPhoto(name) {
          photo.value = name;
          var img = drop.querySelector('img') || document.createElement('img');
          img.src = '/uploads/' + name;
          img.alt = '';
          if (!img.parentNode) drop.insertBefore(img, drop.firstChild);
        }

        /* Downscale in the browser so a 12MP phone photo doesn't fail on a
           slow connection. HEIC can't be drawn to a canvas outside Safari, so
           on failure we send the original and let the server convert it. */
        function shrink(f) {
          return new Promise(function (resolve) {
            if (f.size < 1.5 * 1024 * 1024) return resolve(f);
            var url = URL.createObjectURL(f);
            var img = new Image();
            img.onload = function () {
              var max = 2000;
              var scale = Math.min(1, max / Math.max(img.width, img.height));
              if (scale === 1) { URL.revokeObjectURL(url); return resolve(f); }
              var c = document.createElement('canvas');
              c.width = Math.round(img.width * scale);
              c.height = Math.round(img.height * scale);
              c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
              c.toBlob(function (b) {
                URL.revokeObjectURL(url);
                resolve(b || f);
              }, 'image/jpeg', 0.9);
            };
            img.onerror = function () { URL.revokeObjectURL(url); resolve(f); };
            img.src = url;
          });
        }

        function upload(f) {
          if (!f) return;
          msg.textContent = 'Uploading…';
          bar.hidden = false; fill.style.width = '10%';
          shrink(f).then(function (blob) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/admin/api/upload');
            xhr.upload.onprogress = function (e) {
              if (e.lengthComputable) fill.style.width = (10 + 85 * e.loaded / e.total) + '%';
            };
            xhr.onload = function () {
              bar.hidden = true; fill.style.width = '0';
              var d = {};
              try { d = JSON.parse(xhr.responseText); } catch (e) {}
              if (xhr.status === 200 && d.photo) {
                setPhoto(d.photo);
                msg.textContent = '';
                toast('Photo added.', 'ok');
              } else {
                // A failed upload leaves any previous image in place.
                msg.textContent = d.error || "That photo didn't upload. Try another one.";
                toast(msg.textContent, 'bad');
              }
            };
            xhr.onerror = function () {
              bar.hidden = true;
              msg.textContent = "That photo didn't upload. Check your connection and try again.";
              toast(msg.textContent, 'bad');
            };
            var fd = new FormData();
            fd.append('photo', blob, (f.name || 'photo') + '');
            xhr.send(fd);
          });
        }

        drop.addEventListener('click', function (e) {
          /* Our own doing, not the owner's. input.click() dispatches a real
             click on the input, and it bubbles. While the inputs sat inside
             this dropzone, "Take photo" called cam.click(), the event came
             straight back up here, the target was an INPUT rather than a
             BUTTON, and this handler opened the library over the camera that
             had just been asked for. The inputs now live outside the dropzone
             so the event cannot reach here at all; this guard is what stops it
             mattering if they ever move back in. */
          if (e.target === file || e.target === cam) return;
          if (e.target.tagName !== 'BUTTON') file.click();
        });
        drop.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
        });
        ['dragenter', 'dragover'].forEach(function (n) {
          drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('dropzone--over'); });
        });
        ['dragleave', 'drop'].forEach(function (n) {
          drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('dropzone--over'); });
        });
        drop.addEventListener('drop', function (e) { upload(e.dataTransfer.files[0]); });
        file.addEventListener('change', function () { upload(file.files[0]); });
        cam.addEventListener('change', function () { upload(cam.files[0]); });

        var take = ed.querySelector('[data-take]');
        var choose = ed.querySelector('[data-choose]');
        var clear = ed.querySelector('[data-clearphoto]');
        if (take) take.addEventListener('click', function () { cam.click(); });
        if (choose) choose.addEventListener('click', function () { file.click(); });
        if (clear) clear.addEventListener('click', function () {
          photo.value = '';
          var img = drop.querySelector('img');
          if (img) img.remove();
          toast('Photo removed.', 'ok');
        });

        window.addEventListener('paste', function (e) {
          if (!drop.closest('details') || drop.closest('details').open) {
            var items = (e.clipboardData || {}).items || [];
            for (var i = 0; i < items.length; i++) {
              if (items[i].type.indexOf('image') === 0) { upload(items[i].getAsFile()); break; }
            }
          }
        });
      }
    });
  });

  section("Autosave", function () {
    /* --- Autosave: closing the tab mid-build must never lose work ---------- */
    document.querySelectorAll('form[data-autosave]').forEach(function (form) {
      var flag = form.querySelector('[data-saveflag]');
      var timer = null;
      function save() {
        var fd = new FormData(form);
        fd.append('draft', '1');
        if (flag) flag.textContent = 'Saving…';
        /* redirect: 'manual' so a redirect cannot be mistaken for a save. On
           success these routes answer 200 with {ok:true}; only a lost session
           redirects, and following it produced the login page with a 200, which
           read as r.ok and wrote "Saved" over work that was never stored.
           The server now answers 401 to an X-Draft post, so both the status and
           the opaque redirect say the same thing. */
        fetch(form.action, {
          method: 'POST', body: fd,
          headers: { 'X-Draft': '1' },
          redirect: 'manual',
        })
          .then(function (r) {
            if (!flag) return;
            if (r.ok) { flag.textContent = 'Saved'; return; }
            var signedOut = r.status === 401 || r.type === 'opaqueredirect' || r.status === 0;
            flag.textContent = signedOut
              ? 'NOT SAVED — your sign-in expired. Open the dashboard in a new tab, sign in, then save again.'
              : 'Not saved — check your connection';
            toast(flag.textContent, 'bad');
          })
          .catch(function () {
            if (flag) flag.textContent = 'Not saved — check your connection';
          });
      }
      form.addEventListener('input', function () {
        if (flag) flag.textContent = 'Unsaved changes';
        clearTimeout(timer);
        timer = setTimeout(save, 1200);
      });
      form.addEventListener('change', function () {
        clearTimeout(timer);
        timer = setTimeout(save, 400);
      });
    });
  });
})();
