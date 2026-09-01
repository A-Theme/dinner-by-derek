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

  section("The active tab", function () {
    /* --- Bring the marked tab into view ------------------------------------
       The nav is one row of eleven that scrolls sideways, so on a phone the
       tab you are on is usually past the right edge: Graphics sits 900px along
       a 375px screen. Marking it is not much use if nobody can see the mark.

       Only the nav's own scrollLeft is touched — not scrollIntoView, which is
       free to scroll ancestors and would move the page under a sticky bar. And
       only when the tab is actually out of view, so the common case of Today
       or This Week does not jump on every load. */
    var ul = document.querySelector('.admin-nav ul');
    var cur = ul && ul.querySelector('a[aria-current="page"]');
    if (!ul || !cur) return;

    var pad = 24;
    var left = cur.offsetLeft;
    var right = left + cur.offsetWidth;
    var viewLeft = ul.scrollLeft;
    var viewRight = viewLeft + ul.clientWidth;

    if (left < viewLeft + pad || right > viewRight - pad) {
      ul.scrollLeft = Math.max(0, left - (ul.clientWidth - cur.offsetWidth) / 2);
    }
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
    /* Decoded once, by URLSearchParams, and not again.
     *
     * The second decodeURIComponent was not a belt-and-braces — it was a throw
     * waiting for a percent sign. back() puts the sentence in the query string,
     * URLSearchParams encodes a literal % as %25, .get() hands it back as %,
     * and decoding THAT is a URIError: URI malformed. So removing "100% Beef
     * Chili" from the saved list stored the dish, redirected correctly, and
     * then reported "The saved/failed message isn't working on this page" —
     * the one time the owner is told the dashboard is broken is the moment a
     * write succeeded. The line below it never ran either, so the stale ?ok=
     * stayed in the address bar and said it again on the next reload. */
    var params = new URLSearchParams(location.search);
    if (params.get('ok')) toast(params.get('ok'), 'ok');
    if (params.get('err')) toast(params.get('err'), 'bad');
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

  section("The day settings disclosure", function () {
    /* --- The rare day settings, open on a desktop --------------------------
       Closed-this-day and the daily cap are one <details> in the markup so a
       phone can leave them shut and get to the dish first. A desktop has the
       room and has always shown them open, and there is no CSS that can open a
       <details> — so it is opened here rather than by a second template that
       would then have to be kept in step with the first.

       Only ever opened, never closed: narrowing a desktop window should not
       swallow a box that is being filled in. And the summary is hidden by CSS
       only while the box is open, so with no JavaScript at all a desktop still
       has a line to click rather than two settings it cannot reach. */
    // The complement of the phone query in admin.css, spelled the same way it
    // is there, so a fractional width from browser zoom cannot fall between them.
    var wide = window.matchMedia('not all and (max-width: 680px)');
    function sync() {
      if (!wide.matches) return;
      document.querySelectorAll('.day-rare').forEach(function (d) { d.open = true; });
    }
    sync();
    if (wide.addEventListener) wide.addEventListener('change', sync);
    else if (wide.addListener) wide.addListener(sync);        // Safari < 14
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

        /* Assigning .value from script fires nothing. Autosave listens for
           events, so without this dispatch the filename sits in the form and
           is never posted: the photo shows on screen, the flag says Saved, and
           the column stays NULL. Every write to this field goes through here
           for that reason. */
        function setPhotoValue(name) {
          photo.value = name;
          photo.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function setPhoto(name) {
          setPhotoValue(name);
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
          setPhotoValue('');
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
      form.addEventListener('input', function (e) {
        if (e.target && e.target.type === 'file') return;   // see the change handler below
        if (flag) flag.textContent = 'Unsaved changes';
        clearTimeout(timer);
        timer = setTimeout(save, 1200);
      });
      form.addEventListener('change', function (e) {
        /* Choosing a photo is not an edit — it starts an upload, and the
           filename only exists once that finishes. Saving on this event posted
           the still-empty hidden field and wrote NULL over the column ~400ms
           before the upload could fill it, then never fired again. The upload
           dispatches its own change when the value actually lands. */
        if (e.target && e.target.type === 'file') return;
        clearTimeout(timer);
        timer = setTimeout(save, 400);
      });
    });
  });

  section("Dish picker filter", function () {
    /* --- Narrowing a long dish list ----------------------------------------
     * The picker offers every saved dish, and the saved list is the length of
     * everything the kitchen has ever cooked -- several hundred rows once a
     * menu history has been imported. Scrolling that with a thumb to find one
     * dish is the kind of control that gets abandoned halfway.
     *
     * Filtering happens here rather than on the server because the picker sits
     * inside a half-written recipe. A round trip to search would either lose
     * the ingredients typed so far or need them carried through the query
     * string, and neither is worth it to shorten a list already in the page.
     *
     * The field is rendered hidden and revealed here. With no JavaScript it
     * never appears at all, which is better than showing a search box that
     * does nothing -- the select underneath still works perfectly well.
     */
    var boxes = document.querySelectorAll(".dish-filter");
    for (var i = 0; i < boxes.length; i++) wire(boxes[i]);

    function wire(box) {
      var select = box.parentNode.querySelector(".dish-picker");
      if (!select) return;

      /* Snapshot the list before anything is filtered out of it. Rebuilding
         from this each time means a narrowing search and a widening one cost
         the same, and a backspace restores exactly what was there before. */
      var groups = [];
      var kids = select.children;
      for (var k = 0; k < kids.length; k++) {
        var node = kids[k];
        if (node.tagName === "OPTGROUP") {
          var opts = [];
          for (var o = 0; o < node.children.length; o++) opts.push(node.children[o]);
          groups.push({ label: node.label, options: opts });
        } else {
          groups.push({ label: null, options: [node] });
        }
      }

      box.hidden = false;
      box.addEventListener("input", function () { apply(box.value); });
      /* Enter in a search box inside a form submits the form. Here that would
         save a half-written recipe because someone finished typing a filter. */
      box.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); apply(box.value); }
      });

      function apply(query) {
        var needle = String(query || "").trim().toLowerCase();
        /* Whatever is chosen right now always survives the filter. Dropping
           it from the list would quietly reset the select to its first entry,
           and the recipe would save pointing at a different dish -- or none --
           because the owner typed in a search box. */
        var current = select.value;
        var matches = 0;

        while (select.firstChild) select.removeChild(select.firstChild);

        for (var g = 0; g < groups.length; g++) {
          var group = groups[g];
          var kept = [];
          for (var i2 = 0; i2 < group.options.length; i2++) {
            var opt = group.options[i2];
            var keep = !needle
              || !opt.value                                   // "not a menu dish"
              || opt.value === current                        // the standing choice
              || (opt.textContent || "").toLowerCase().indexOf(needle) !== -1;
            if (keep) {
              kept.push(opt);
              if (opt.value && opt.value !== current) matches++;
            }
          }
          if (!kept.length) continue;
          if (group.label === null) {
            for (var a = 0; a < kept.length; a++) select.appendChild(kept[a]);
          } else {
            var grp = document.createElement("optgroup");
            grp.label = group.label;
            for (var b = 0; b < kept.length; b++) grp.appendChild(kept[b]);
            select.appendChild(grp);
          }
        }

        if (needle && !matches) {
          var none = document.createElement("option");
          none.disabled = true;
          none.textContent = "No dish matches “" + query.trim() + "”";
          select.appendChild(none);
        }
        select.value = current;
      }
    }
  });
  section("The proofreader", function () {
    /* --- Spelling and grammar ---------------------------------------------
     * Every field the owner writes prose into carries data-proof. Two things
     * hang off it, and they are different tools doing different jobs.
     *
     * First: spellcheck="true" and lang="en-CA", set here rather than in the
     * templates so a field added later cannot quietly miss it. That is the
     * browser's own dictionary — the long tail of English, underlined in red,
     * with whatever words the owner has added to it. Nothing beats it and this
     * file does not try.
     *
     * Second: a panel under the field listing what the browser cannot see —
     * "sever with crusty bread", a doubled "the", two spaces, a comma with a
     * space in front of it, and the kitchen's own vocabulary. server/
     * proofread.js says what each rule is and why it is safe.
     *
     * Advisory, exactly like the allergen chips above it. Nothing is applied
     * until a chip is tapped, and the field saves as typed either way.
     */
    var fields = document.querySelectorAll("[data-proof]");
    if (!fields.length) return;

    /* A finding about whitespace has nothing to show: "  " and "" are the same
       chip to a reader. The invisible ones get named instead. */
    function visible(s, kind) {
      if (s === "") return "nothing";
      if (kind !== "spacing") return s;
      /* A spacing chip is otherwise unreadable: " ," and "," are the same two
         characters to a reader, and the first draft of this panel really did
         show "  , → ,". Every space in a spacing finding is drawn. */
      return s.replace(/[ \t]/g, "␣");
    }

    /* What the ✓ button announces. The glyph above is right for the eye and
       useless in a screen reader, which reads it as an open box or nothing at
       all — so whitespace gets counted out in words instead. */
    function spoken(s, kind) {
      if (s === "") return "nothing";
      /* Only spacing findings get their whitespace counted out. Doing it to
         every finding turns "for desert" into "for a space desert". */
      if (kind !== "spacing") return s;
      var out = s.replace(/[ \t]+/g, function (run) {
        return run.length === 1 ? " a space " : " " + run.length + " spaces ";
      }).replace(/\s+/g, " ").trim();
      return out || "nothing";
    }

    fields.forEach(function (field) {
      field.setAttribute("spellcheck", "true");
      field.setAttribute("lang", "en-CA");

      /* Built here rather than in the templates. Six views hold a field worth
         checking and one of them is generated per weekday, so a markup block
         to keep in step with this code in each of them is a block that goes
         out of step. */
      var box = document.createElement("div");
      box.className = "suggestions proof";
      box.hidden = true;
      var head = document.createElement("div");
      head.className = "suggestions__label";
      box.appendChild(head);
      var list = document.createElement("div");
      box.appendChild(list);

      /* After the field, or after the label that wraps it — the recipe editor
         puts its textareas inside <label>, and inserting between a label and
         its own control would put the panel above the box it describes. */
      var anchor = field.parentNode && field.parentNode.tagName === "LABEL"
        ? field.parentNode : field;
      anchor.parentNode.insertBefore(box, anchor.nextSibling);

      var timer = null;
      var ignored = {};        // chips waved away, for this page load
      var inFlight = false;
      var again = false;

      function keyOf(f) { return f.kind + "|" + f.found + "|" + f.suggestion; }

      function apply(f) {
        var text = field.value;
        /* The span is checked before it is spliced. The findings were computed
           against the text as it was, and the owner can carry on typing while
           the panel is on screen — applying a stale offset would eat the wrong
           letters, and there would be nothing on screen to say so. */
        if (text.slice(f.start, f.end) !== f.found) {
          toast("That bit has changed since it was flagged — have another look.", "bad");
          check();
          return;
        }
        var caret = f.start + f.suggestion.length;
        field.value = text.slice(0, f.start) + f.suggestion + text.slice(f.end);
        /* Fired, not assumed. The allergen review, the autosave and the dish
           name mirror are all listening for input on this field, and a value
           set from script raises no event of its own. Without this line an
           accepted fix rewrites a reviewed description and leaves the tick in
           place — the exact stale acknowledgement the publish gate exists to
           prevent. */
        field.dispatchEvent(new Event("input", { bubbles: true }));
        if (field.setSelectionRange && document.activeElement === field) {
          try { field.setSelectionRange(caret, caret); } catch (e) { /* not a text box */ }
        }
        check();
      }

      function draw(findings) {
        list.innerHTML = "";
        var shown = findings.filter(function (f) { return !ignored[keyOf(f)]; });
        box.hidden = !shown.length;
        if (!shown.length) return;
        head.textContent = shown.length === 1
          ? "1 thing to look at — nothing changes until you tap it"
          : shown.length + " things to look at — nothing changes until you tap one";

        shown.forEach(function (f) {
          var w = document.createElement("span");
          w.className = "sugg sugg--" + f.kind;
          w.title = f.message;

          /* Nodes, not a string. The words in a finding come from the owner's
             own text and from a dictionary he edits, so they are content, and
             content goes in through textContent. */
          var chip = document.createElement("span");
          var from = document.createElement("s");
          from.textContent = visible(f.found, f.kind);
          var to = document.createElement("strong");
          to.textContent = visible(f.suggestion, f.kind);
          chip.appendChild(from);
          chip.appendChild(document.createTextNode(" → "));
          chip.appendChild(to);
          var why = document.createElement("span");
          why.className = "sugg__why";
          why.textContent = f.message;
          chip.appendChild(why);
          w.appendChild(chip);

          var yes = document.createElement("button");
          yes.type = "button";
          yes.dataset.accept = "1";
          yes.textContent = "✓";
          yes.setAttribute("aria-label", "Change " + spoken(f.found, f.kind)
            + " to " + spoken(f.suggestion, f.kind));
          yes.addEventListener("click", function () { apply(f); });

          var no = document.createElement("button");
          no.type = "button";
          no.textContent = "✕";
          no.setAttribute("aria-label", "Leave " + spoken(f.found, f.kind) + " as it is");
          no.addEventListener("click", function () { ignored[keyOf(f)] = true; check(); });

          w.appendChild(yes);
          w.appendChild(no);
          list.appendChild(w);
        });
      }

      function check() {
        /* An empty box has nothing to say about it, and asking costs a round
           trip. This Week carries twenty-three of these — a name and a
           description for each of seven days, the week blurb and the closure
           notes — and almost all of them are empty almost all of the time. It
           opened with twenty-three requests before this line, on a phone, to
           be told twenty-three times that nothing was wrong. */
        if (!field.value.trim()) { box.hidden = true; list.innerHTML = ""; return; }
        /* One request at a time per field, with the latest text winning. A
           chip accepted three times quickly used to put three overlapping
           checks in the air, and whichever answered last drew the panel —
           sometimes the one computed before the fix. */
        if (inFlight) { again = true; return; }
        inFlight = true;
        fetch("/admin/api/proofread", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: field.value }),
        }).then(function (r) { return r.json(); }).then(function (d) {
          /* Anything that is not a list of findings is not a list of findings.
             An expired session answers {error:...}, and reading .filter off
             that throws inside the promise — which is how a panel stops
             appearing with nothing said and nothing in a console anybody has
             open. */
          if (!d || !Array.isArray(d.findings)) { box.hidden = true; return; }
          draw(d.findings);
        }).catch(function () {
          /* Proofreading is advisory: a dropped request costs a suggestion,
             which is not worth a message. */
        }).then(function () {
          inFlight = false;
          if (again) { again = false; check(); }
        });
      }

      field.addEventListener("input", function () {
        clearTimeout(timer);
        /* Longer than the allergen debounce on purpose. Allergens want to keep
           up with a dish name being typed; a spelling chip appearing in the
           middle of a half-typed word is only noise, so this waits for a
           pause. */
        timer = setTimeout(check, 700);
      });
      field.addEventListener("blur", function () { clearTimeout(timer); check(); });
      check();
    });
  });

})();
