/**
 * Cedar — Post Scheduling & Future Release Engine
 * Manages future-dated post scheduling, confirmation modals,
 * automated time-based release to 'published', and Home feed integration.
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;

  let pendingFutureDate = null;
  let pendingSourceInput = null;
  let previousInputDate = null;
  let checkInterval = null;

  /**
   * Helper: Formats 24h time 'HH:MM' into friendly 12h time 'H:MM AM/PM'
   */
  function formatTimeDisplay(timeStr) {
    if (!timeStr) return '9:00 AM';
    const parts = timeStr.split(':');
    let h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    if (isNaN(h)) return '9:00 AM';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  }

  /**
   * Helper: Calculates friendly relative countdown string (e.g. 'in 3 days')
   */
  function formatTimeUntil(targetTimestamp) {
    if (!targetTimestamp) return '';
    const now = Date.now();
    const diff = targetTimestamp - now;
    if (diff <= 0) return 'ready for release';

    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;

    if (diff < HOUR) {
      const mins = Math.max(1, Math.round(diff / MINUTE));
      return `in ${mins}m`;
    }
    if (diff < DAY) {
      const hrs = Math.round(diff / HOUR);
      return `in ${hrs}h`;
    }
    const days = Math.round(diff / DAY);
    if (days === 1) return 'tomorrow';
    return `in ${days} days`;
  }

  /**
   * Helper: Resolves local epoch millisecond timestamp for a given 'YYYY-MM-DD' and 'HH:MM'
   */
  function getTimestampForDateAndTime(dateStr, timeStr) {
    if (!dateStr) return Date.now();
    if (!timeStr) timeStr = '09:00';
    const parts = dateStr.split('-');
    const timeParts = timeStr.split(':');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const hour = parseInt(timeParts[0], 10) || 0;
    const minute = parseInt(timeParts[1], 10) || 0;

    const target = new Date(year, month, day, hour, minute, 0, 0);
    return target.getTime();
  }

  /**
   * Helper: Synchronizes date and schedule badges across all date inputs
   */
  function syncDateInputs(dateVal) {
    const metaDate = document.getElementById('meta-date');
    const setupDate = document.getElementById('setup-post-date');
    if (metaDate && metaDate.value !== dateVal) metaDate.value = dateVal || '';
    if (setupDate && setupDate.value !== dateVal) setupDate.value = dateVal || '';

    const previewDate = document.getElementById('preview-date');
    if (previewDate && typeof window.formatDateDisplay === 'function') {
      previewDate.textContent = window.formatDateDisplay(dateVal);
      previewDate.setAttribute('datetime', dateVal || '');
    }

    if (typeof window.updateVisualCardPreviews === 'function') {
      window.updateVisualCardPreviews();
    }
    if (typeof window.updateBackgroundCodeStrings === 'function') {
      window.updateBackgroundCodeStrings();
    }
  }

  /**
   * Opens the future date confirmation modal
   */
  function openFutureScheduleModal(futureDate, sourceInput) {
    pendingFutureDate = futureDate;
    pendingSourceInput = sourceInput;
    previousInputDate = (window.currentDraft && window.currentDraft.date)
      ? window.currentDraft.date
      : (typeof window.getLocalIsoDate === 'function' ? window.getLocalIsoDate() : new Date().toLocaleDateString('en-CA'));

    initScheduleModalBindings();

    const modal = document.getElementById('modal-schedule-future-post');
    if (!modal) {
      // If modal DOM is not present, fallback to window.confirm
      const wantSchedule = window.confirm(`The date you selected (${futureDate}) is in the future. Would you like to schedule this post for automatic release?`);
      if (wantSchedule) {
        const timeInput = window.prompt(`What time should this post be released on ${futureDate}?`, '09:00');
        if (timeInput) {
          schedulePostRelease(window.currentDraft, futureDate, timeInput);
          return;
        }
      }
      setFutureDateWithoutSchedule(window.currentDraft, futureDate);
      return;
    }

    // Reset modal views to Step 1
    const step1 = document.getElementById('future-modal-step-ask');
    const step2 = document.getElementById('future-modal-step-time');
    const footer1 = document.getElementById('future-modal-footer-step1');
    const footer2 = document.getElementById('future-modal-footer-step2');
    const dateDisplay = document.getElementById('future-modal-date-display');
    const dateTimeDisplay = document.getElementById('future-modal-date-time-display');

    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
    if (footer1) footer1.style.display = 'flex';
    if (footer2) footer2.style.display = 'none';

    const formattedDate = typeof window.formatDateDisplay === 'function' ? window.formatDateDisplay(futureDate) : futureDate;
    if (dateDisplay) dateDisplay.textContent = formattedDate;
    if (dateTimeDisplay) dateTimeDisplay.textContent = formattedDate;

    modal.style.display = 'flex';
    if (typeof window.openModal === 'function') {
      window.openModal('modal-schedule-future-post');
    }
  }

  /**
   * Applies the future date as a normal date WITHOUT scheduling
   */
  function setFutureDateWithoutSchedule(draft, futureDate) {
    if (!draft) return;

    draft.date = futureDate;
    draft.publishDateUserSet = true;
    draft.scheduled = false;
    delete draft.scheduledAt;
    delete draft.scheduledTime;
    delete draft.scheduledDate;

    if (draft.status === 'scheduled') {
      draft.status = 'draft';
    }
    if (draft.status === 'published') {
      draft.publishedDate = futureDate;
    }

    syncDateInputs(futureDate);

    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
    if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();

    const formatted = typeof window.formatDateDisplay === 'function' ? window.formatDateDisplay(futureDate) : futureDate;
    if (typeof window.showToast === 'function') {
      window.showToast(`Publish date set to ${formatted}`);
    }

    // Refresh home feed if currently active
    if (typeof window.renderHomeActivityStream === 'function') {
      window.renderHomeActivityStream();
    }
  }

  /**
   * Schedules a post for automated release at a given date and time
   */
  function schedulePostRelease(draft, futureDate, timeStr) {
    if (!draft) return;
    if (!timeStr) timeStr = '09:00';

    const targetTs = getTimestampForDateAndTime(futureDate, timeStr);

    draft.date = futureDate;
    draft.publishDateUserSet = true;
    draft.status = 'scheduled';
    draft.scheduled = true;
    draft.scheduledDate = futureDate;
    draft.scheduledTime = timeStr;
    draft.scheduledAt = targetTs;

    syncDateInputs(futureDate);

    if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
    if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();

    const formattedDate = typeof window.formatDateDisplay === 'function' ? window.formatDateDisplay(futureDate) : futureDate;
    const formattedTime = formatTimeDisplay(timeStr);
    if (typeof window.showToast === 'function') {
      window.showToast(`Post scheduled for release on ${formattedDate} at ${formattedTime}`);
    }

    // Refresh home stream if active
    if (typeof window.renderHomeActivityStream === 'function') {
      window.renderHomeActivityStream();
    }
    if (typeof window.renderPipeline === 'function') {
      window.renderPipeline();
    }
  }

  /**
   * Cancels a scheduled post and reverts it to a standard draft
   */
  function cancelScheduledPost(postId) {
    const draftsList = (typeof window.drafts !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : [];
    const post = draftsList.find(d => d.id === postId);
    if (!post) return;

    post.status = 'draft';
    post.scheduled = false;
    delete post.scheduledAt;
    delete post.scheduledTime;
    delete post.scheduledDate;

    if (window.currentDraft && window.currentDraft.id === postId) {
      window.currentDraft.status = 'draft';
      window.currentDraft.scheduled = false;
      delete window.currentDraft.scheduledAt;
      delete window.currentDraft.scheduledTime;
      delete window.currentDraft.scheduledDate;
    }

    if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();
    if (typeof window.showToast === 'function') {
      window.showToast('Scheduled release cancelled. Post saved as draft.');
    }

    if (typeof window.renderHomeActivityStream === 'function') {
      window.renderHomeActivityStream();
    }
    if (typeof window.renderPipeline === 'function') {
      window.renderPipeline();
    }
  }

  /**
   * Publishes a scheduled post immediately
   */
  function publishScheduledPostImmediately(postId) {
    const draftsList = (typeof window.drafts !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : [];
    const post = draftsList.find(d => d.id === postId);
    if (!post) return;

    const todayIso = typeof window.getLocalIsoDate === 'function' ? window.getLocalIsoDate() : new Date().toLocaleDateString('en-CA');
    post.status = 'published';
    post.everPublished = true;
    post.publishedSlug = post.slug;
    post.slugCommitted = true;
    const pubDate = (post.date && post.date <= todayIso) ? post.date : todayIso;
    post.publishedDate = pubDate;
    if (pubDate < todayIso) {
      const parts = pubDate.split('-').map(Number);
      post.publishedAt = (parts.length === 3) ? new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0).getTime() : Date.now();
      post.editedDate = todayIso;
      post.editedAt = Date.now();
    } else {
      post.publishedAt = Date.now();
    }
    post.scheduled = false;
    delete post.scheduledAt;
    delete post.scheduledTime;
    delete post.scheduledDate;

    if (window.currentDraft && window.currentDraft.id === postId) {
      window.currentDraft.status = 'published';
      window.currentDraft.everPublished = true;
      window.currentDraft.publishedSlug = post.publishedSlug;
      window.currentDraft.slugCommitted = true;
      window.currentDraft.publishedDate = post.publishedDate;
      window.currentDraft.publishedAt = post.publishedAt;
      window.currentDraft.editedDate = post.editedDate;
      window.currentDraft.editedAt = post.editedAt;
      window.currentDraft.scheduled = false;
      delete window.currentDraft.scheduledAt;
      delete window.currentDraft.scheduledTime;
      delete window.currentDraft.scheduledDate;
    }

    if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();
    if (typeof window.logActivity === 'function') {
      window.logActivity('post', {
        id: post.id,
        title: post.title || 'Untitled Post',
        action: 'published',
        slug: post.slug || '',
        featuredImage: post.featuredImage || post.coverImage || ''
      }, post.publishedAt);
    }

    if (typeof window.showToast === 'function') {
      window.showToast(`Post "${post.title || 'Untitled'}" is now published!`);
    }

    if (typeof window.renderHomeActivityStream === 'function') {
      window.renderHomeActivityStream();
    }
    if (typeof window.renderPipeline === 'function') {
      window.renderPipeline();
    }
  }

  /**
   * Background Checker: Inspects all scheduled posts and auto-switches to 'published' when time arrives
   */
  function checkScheduledPosts() {
    const draftsList = (typeof window.drafts !== 'undefined' && Array.isArray(window.drafts)) ? window.drafts : [];
    const now = Date.now();
    let anyPublished = false;

    draftsList.forEach(post => {
      if ((post.type === 'post' || !post.type) && (post.status === 'scheduled' || post.scheduled === true)) {
        if (post.scheduledAt && now >= post.scheduledAt) {
          // Time has arrived! Switch to 'published'
          post.status = 'published';
          post.everPublished = true;
          post.publishedSlug = post.slug;
          post.slugCommitted = true;
          post.publishedDate = post.scheduledDate || (typeof window.getLocalIsoDate === 'function' ? window.getLocalIsoDate() : new Date().toLocaleDateString('en-CA'));
          post.publishedAt = now;
          post.scheduled = false;
          delete post.scheduledAt;
          delete post.scheduledTime;
          delete post.scheduledDate;

          if (window.currentDraft && window.currentDraft.id === post.id) {
            window.currentDraft.status = 'published';
            window.currentDraft.everPublished = true;
            window.currentDraft.publishedSlug = post.publishedSlug;
            window.currentDraft.slugCommitted = true;
            window.currentDraft.publishedDate = post.publishedDate;
            window.currentDraft.publishedAt = now;
            window.currentDraft.scheduled = false;
            delete window.currentDraft.scheduledAt;
          }

          if (typeof window.logActivity === 'function') {
            window.logActivity('post', {
              id: post.id,
              title: post.title || 'Untitled Post',
              action: 'published',
              slug: post.slug || '',
              featuredImage: post.featuredImage || post.coverImage || ''
            }, post.publishedAt);
          }

          if (typeof window.showToast === 'function') {
            window.showToast(`Post "${post.title || 'Untitled'}" has been published!`);
          }

          anyPublished = true;
        }
      }
    });

    if (anyPublished) {
      if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();
      if (typeof window.renderHomeActivityStream === 'function') {
        window.renderHomeActivityStream();
      }
      if (typeof window.renderPipeline === 'function') {
        window.renderPipeline();
      }
    }
  }

  /**
   * Intercepts publish date changes to check if the date is in the future
   */
  function handleDateChange(inputEl, draft) {
    if (!inputEl || !draft) return;
    const selectedVal = (inputEl.value || '').trim();
    if (!selectedVal) return;

    const todayIso = typeof window.getLocalIsoDate === 'function' ? window.getLocalIsoDate() : new Date().toISOString().split('T')[0];

    if (selectedVal > todayIso) {
      // Future date chosen! Prompt user
      openFutureScheduleModal(selectedVal, inputEl);
    } else {
      // Today or past date: standard update
      draft.date = selectedVal;
      draft.publishDateUserSet = true;
      draft.scheduled = false;
      delete draft.scheduledAt;
      delete draft.scheduledTime;
      delete draft.scheduledDate;

      if (draft.status === 'scheduled') {
        draft.status = 'draft';
      }
      if (draft.status === 'published') {
        draft.publishedDate = selectedVal;
        const parts = selectedVal.split('-').map(Number);
        if (parts.length === 3) {
          draft.publishedAt = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0).getTime();
        }
        if (selectedVal < todayIso) {
          draft.editedDate = todayIso;
          draft.editedAt = Date.now();
        }
      }

      syncDateInputs(selectedVal);
      if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      if (typeof window.saveDraftsToStorage === 'function') window.saveDraftsToStorage();
      if (typeof window.renderHomeActivityStream === 'function') window.renderHomeActivityStream();
    }
  }

  /**
   * Binds click handlers for the schedule confirmation modal
   */
  function initScheduleModalBindings() {
    const modal = document.getElementById('modal-schedule-future-post');
    if (!modal) return;
    if (modal._hasScheduleBindings) return;
    modal._hasScheduleBindings = true;

    const btnNo = document.getElementById('btn-future-no-just-date');
    const btnYes = document.getElementById('btn-future-yes-schedule');
    const btnBack = document.getElementById('btn-future-time-back');
    const btnConfirm = document.getElementById('btn-future-confirm-schedule');
    const btnClose = document.getElementById('btn-close-future-modal');
    const step1 = document.getElementById('future-modal-step-ask');
    const step2 = document.getElementById('future-modal-step-time');
    const footer1 = document.getElementById('future-modal-footer-step1');
    const footer2 = document.getElementById('future-modal-footer-step2');
    const timeInput = document.getElementById('future-modal-time-input');

    function closeModalDirect() {
      modal.style.display = 'none';
      if (typeof window.closeModal === 'function') {
        window.closeModal('modal-schedule-future-post');
      }
    }

    // 1. "No, Just Set Date": applies date without scheduling
    if (btnNo) {
      btnNo.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (pendingFutureDate && window.currentDraft) {
          setFutureDateWithoutSchedule(window.currentDraft, pendingFutureDate);
        }
        closeModalDirect();
      });
    }

    // 2. "Yes, Schedule It": moves to time picker step
    if (btnYes) {
      btnYes.addEventListener('click', (e) => {
        e.preventDefault();
        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'block';
        if (footer1) footer1.style.display = 'none';
        if (footer2) footer2.style.display = 'flex';
        if (timeInput) {
          setTimeout(() => { timeInput.focus(); }, 100);
        }
      });
    }

    // 3. "Back": returns to Step 1
    if (btnBack) {
      btnBack.addEventListener('click', (e) => {
        e.preventDefault();
        if (step1) step1.style.display = 'block';
        if (step2) step2.style.display = 'none';
        if (footer1) footer1.style.display = 'flex';
        if (footer2) footer2.style.display = 'none';
      });
    }

    // 4. "Schedule Release": schedules the post
    if (btnConfirm) {
      btnConfirm.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const timeVal = (timeInput && timeInput.value) ? timeInput.value : '09:00';
        if (pendingFutureDate && window.currentDraft) {
          schedulePostRelease(window.currentDraft, pendingFutureDate, timeVal);
        }
        closeModalDirect();
      });
    }

    // 5. "Close" or click outside: revert input if uncommitted
    function revertIfUncommitted() {
      if (pendingSourceInput && previousInputDate) {
        pendingSourceInput.value = previousInputDate;
      }
    }

    if (btnClose) {
      btnClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        revertIfUncommitted();
        closeModalDirect();
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        revertIfUncommitted();
        closeModalDirect();
      }
    });
  }

  /**
   * Starts periodic timer to auto-release scheduled posts
   */
  function startSchedulerEngine() {
    checkScheduledPosts();
    if (checkInterval) clearInterval(checkInterval);
    checkInterval = setInterval(checkScheduledPosts, 10000); // Check every 10 seconds

    window.addEventListener('focus', checkScheduledPosts);
    window.addEventListener('hashchange', checkScheduledPosts);
  }

  // Self-init on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initScheduleModalBindings();
      startSchedulerEngine();
    });
  } else {
    initScheduleModalBindings();
    startSchedulerEngine();
  }

  window.Cedar.scheduler = {
    handleDateChange,
    openFutureScheduleModal,
    setFutureDateWithoutSchedule,
    schedulePostRelease,
    cancelScheduledPost,
    publishScheduledPostImmediately,
    checkScheduledPosts,
    formatTimeDisplay,
    formatTimeUntil,
    getTimestampForDateAndTime
  };
  window.Outpost.scheduler = window.Cedar.scheduler;

  window.handleFutureDateChange = handleDateChange;
  window.checkScheduledPosts = checkScheduledPosts;
})();
