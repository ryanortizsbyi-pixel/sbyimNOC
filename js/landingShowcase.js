/**
 * SBYIM NOC Portal - Landing Showcase Manager
 * Handles the initial front-screen experience:
 *   - Left Side: News & Updates bulletins, filtering, and detail modal
 *   - Right Side: Video Showcase player, custom controls, playlist switching, and custom video URL loader
 */

class LandingShowcaseManager {
  constructor() {
    this.currentCategory = 'all';
    this.activeTrackIndex = 0;
    this.isPlaying = false;
    this.customVideoData = null;

    // Curated News & Updates Bulletins
    this.newsItems = [
      {
        id: 'news-1',
        category: 'regulatory',
        categoryLabel: 'Regulatory Notice',
        badgeClass: 'tag-regulatory',
        date: '08 Sep 2026',
        department: 'SBYIM Compliance & Regulatory Office',
        ref: 'REF: SBYI-REG-2026-089',
        title: '2026 Updated NOC Submission & Clearance Guidelines',
        excerpt: 'All contractors and clients must submit revised environmental safety and site clearance documentation along with the standard activity NOC application. Digital approval seals are now mandatory across all island project zones.',
        fullContent: `
          <div class="news-content-highlight">
            <strong>Mandatory Policy Advisory:</strong> Effective September 2026, all No Objection Certificate (NOC) submissions for on-island activities must include the updated Environmental & Site Safety Declaration (ESD-2026).
          </div>
          <p>
            The Sir Bani Yas Island Management (SBYIM) Regulatory Board has published the revised operational guidelines for contractor activity permits, site inspections, and cross-island logistics.
          </p>
          <h4 style="font-size:0.95rem; font-weight:700; color:var(--text-main); margin-top:0.5rem;">Key Requirements for New Submissions:</h4>
          <ul class="news-content-list">
            <li><strong>Mandatory Digital Verification:</strong> All permits issued will carry an encrypted verification hash and QR code for rapid checkpoint authorization.</li>
            <li><strong>Dual Endorsement:</strong> Both Client and Principal Contractor representatives must sign the scope of work statement.</li>
            <li><strong>Site Restoration Bond:</strong> Temporary works in environmentally sensitive coastal zones require an approved decommissioning plan prior to NOC issuance.</li>
          </ul>
          <p>
            Contractors with active permits expiring within the next 30 days are advised to initiate renewal procedures at least 14 days in advance to avoid work interruption at island transit points.
          </p>
        `
      },
      {
        id: 'news-2',
        category: 'system',
        categoryLabel: 'System Update',
        badgeClass: 'tag-system',
        date: '04 Sep 2026',
        department: 'SBYIM IT & Digital Transformation Division',
        ref: 'REF: SBYI-SYS-2026-042',
        title: 'Sir Bani Yas Island Digital Permit & Instantaneous QR Verification System',
        excerpt: 'Security checkpoints across Sir Bani Yas Island have upgraded to instantaneous QR code verification for active NOC records, reducing transit checkpoint clearance time to under 15 seconds.',
        fullContent: `
          <div class="news-content-highlight">
            <strong>System Upgrade Notice:</strong> The automated gate and jetty verification systems have been upgraded to provide instant real-time synchronization with the SBYIM central NOC database.
          </div>
          <p>
            Contractors and project logistics personnel can now present digital PDF certificates or mobile QR codes directly at checkpoint scanners. The system performs instantaneous validity checking against current status (Active, Expiring, or Expired).
          </p>
          <h4 style="font-size:0.95rem; font-weight:700; color:var(--text-main); margin-top:0.5rem;">System Enhancements:</h4>
          <ul class="news-content-list">
            <li>Sub-second database query speed for remote security checkpoints.</li>
            <li>Offline caching for marine transport vessels during transit across the channel.</li>
            <li>Direct link to uploaded safety certificates and company trade permits.</li>
          </ul>
          <p>
            For technical support regarding digital permit generation, please contact the SBYIM Help Desk or use the in-app AI Assistant.
          </p>
        `
      },
      {
        id: 'news-3',
        category: 'environmental',
        categoryLabel: 'Environmental Policy',
        badgeClass: 'tag-environmental',
        date: '28 Aug 2026',
        department: 'Environment & Wildlife Conservation Dept.',
        ref: 'REF: SBYI-ENV-2026-017',
        title: 'Marine & Coastal Works Environmental Protection Standards',
        excerpt: 'Strict compliance measures are in effect for coastal and marine activities. Specialized environmental protection plans must accompany all marine NOC applications.',
        fullContent: `
          <div class="news-content-highlight">
            <strong>Wildlife & Marine Protection Directive:</strong> Sir Bani Yas Island marine reserve zones require heightened ecological precautions for all dredging, jetty maintenance, and coastal reinforcement works.
          </div>
          <p>
            In accordance with the Abu Dhabi Environmental Authority standards and SBYIM conservation directives, all maritime contractors must maintain active containment booms and adhere strictly to designated marine navigation corridors.
          </p>
          <h4 style="font-size:0.95rem; font-weight:700; color:var(--text-main); margin-top:0.5rem;">Mandatory Environmental Protocols:</h4>
          <ul class="news-content-list">
            <li>Turbidity monitoring logs must be submitted weekly for all active marine permits.</li>
            <li>Heavy machinery operations near wildlife reserve perimeters are restricted between 19:00 and 06:00.</li>
            <li>Hazardous materials storage is strictly prohibited within 200 meters of the high-tide baseline.</li>
          </ul>
        `
      },
      {
        id: 'news-4',
        category: 'operations',
        categoryLabel: 'Operational Advisory',
        badgeClass: 'tag-operations',
        date: '20 Aug 2026',
        department: 'Island Operations & Infrastructure Management',
        ref: 'REF: SBYI-OPS-2026-061',
        title: 'Fast-Track NOC Processing Protocol for Critical Utility Repairs',
        excerpt: 'Critical infrastructure repairs and maintenance teams can now request emergency fast-track review through the dedicated operations desk.',
        fullContent: `
          <div class="news-content-highlight">
            <strong>Operational Advisory:</strong> A rapid-turnaround window is now available for emergency potable water, power grid, and telecommunications maintenance.
          </div>
          <p>
            To prevent service interruptions to island facilities and hospitality lodges, authorized utility partners may apply under the "Emergency Infrastructure" NOC category. Review and issuance under this protocol are prioritized within a 4-hour evaluation window.
          </p>
          <p>
            Emergency submissions require formal supervisor sign-off and must be followed by standard compliance documentation within 48 hours of work completion.
          </p>
        `
      },
      {
        id: 'news-5',
        category: 'regulatory',
        categoryLabel: 'Compliance Bulletin',
        badgeClass: 'tag-regulatory',
        date: '15 Aug 2026',
        department: 'Legal & Corporate Compliance Directorate',
        ref: 'REF: SBYI-COC-2026-003',
        title: 'Mandatory Annual SBYI Code of Conduct (COC) Refresh',
        excerpt: 'All authorized contractors working on the island must ensure that on-site personnel are briefed on the SBYI Code of Conduct guidelines available in the portal.',
        fullContent: `
          <div class="news-content-highlight">
            <strong>Annual Compliance Refresh:</strong> The SBYI Code of Conduct (COC) establishes strict standards for safety, environmental stewardship, and professional behavior across all island zones.
          </div>
          <p>
            Project managers must verify that all deployed personnel have reviewed the official COC document (accessible via the top navigation bar "SBYI COC" button). Retaining copies on-site during inspection rounds is mandatory.
          </p>
        `
      }
    ];

    // Curated Video Tracks
    this.videoTracks = [
      {
        id: 'track-1',
        title: 'Sir Bani Yas Island Overview & Operations',
        tag: 'SBYIM Official Briefing',
        duration: '3:24',
        type: 'mp4',
        src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        poster: 'assets/sir_bani_yas_island.jpg',
        desc: 'Explore Sir Bani Yas Island infrastructure, nature reserves, and official NOC permit management protocols.'
      },
      {
        id: 'track-2',
        title: 'NOC Application & Contractor Guidelines',
        tag: 'Step-by-Step Guide',
        duration: '2:45',
        type: 'mp4',
        src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
        poster: 'assets/sir_bani_yas_island.jpg',
        desc: 'Detailed walkthrough on permit submissions, required attachments, client endorsements, and validation.'
      },
      {
        id: 'track-3',
        title: 'Environmental Safety & Wildlife Standards',
        tag: 'Conservation Protocol',
        duration: '4:10',
        type: 'mp4',
        src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        poster: 'assets/sir_bani_yas_island.jpg',
        desc: 'Crucial environmental protection standards and wildlife preservation measures for contractors.'
      }
    ];

    this.init();
  }

  init() {
    this.bindEvents();
    this.renderNewsList();
    this.renderPlaylistGrid();
  }

  /**
   * Bind event listeners for News filters, modals, and Video player controls
   */
  bindEvents() {
    // 1. News Category Filter Pills
    const filterPills = document.getElementById('newsFilterPills');
    if (filterPills) {
      filterPills.addEventListener('click', (e) => {
        const btn = e.target.closest('.news-pill');
        if (!btn) return;
        filterPills.querySelectorAll('.news-pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        this.currentCategory = btn.getAttribute('data-category') || 'all';
        this.renderNewsList();
      });
    }

    // 2. News Detail Modal close handlers
    const btnCloseNewsModal = document.getElementById('btnCloseNewsModal');
    const btnCloseNewsModalBtn = document.getElementById('btnCloseNewsModalBtn');
    const newsModal = document.getElementById('newsDetailModal');

    if (btnCloseNewsModal) btnCloseNewsModal.addEventListener('click', () => this.closeNewsModal());
    if (btnCloseNewsModalBtn) btnCloseNewsModalBtn.addEventListener('click', () => this.closeNewsModal());
    if (newsModal) {
      newsModal.addEventListener('click', (e) => {
        if (e.target === newsModal) this.closeNewsModal();
      });
    }

    // 3. Video Player Elements & Event Listeners
    const videoEl = document.getElementById('landingVideoElement');
    const overlay = document.getElementById('videoOverlay');
    const btnOverlayPlay = document.getElementById('btnVideoOverlayPlay');
    const btnPlayPause = document.getElementById('btnVideoPlayPause');
    const btnMute = document.getElementById('btnVideoMute');
    const volumeSlider = document.getElementById('videoVolumeSlider');
    const btnFullscreen = document.getElementById('btnVideoFullscreen');
    const progressContainer = document.getElementById('videoProgressContainer');

    if (btnOverlayPlay) {
      btnOverlayPlay.addEventListener('click', (e) => {
        e.stopPropagation();
        this.playVideo();
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        this.playVideo();
      });
    }

    if (btnPlayPause) {
      btnPlayPause.addEventListener('click', () => {
        this.togglePlayPause();
      });
    }

    if (videoEl) {
      videoEl.addEventListener('click', () => {
        this.togglePlayPause();
      });

      videoEl.addEventListener('timeupdate', () => {
        this.updateVideoProgress();
      });

      videoEl.addEventListener('loadedmetadata', () => {
        this.updateVideoDuration();
      });

      videoEl.addEventListener('ended', () => {
        this.onVideoEnded();
      });

      videoEl.addEventListener('play', () => {
        this.isPlaying = true;
        this.updatePlayIcons();
        if (overlay) overlay.classList.add('hidden');
      });

      videoEl.addEventListener('pause', () => {
        this.isPlaying = false;
        this.updatePlayIcons();
      });
    }

    if (progressContainer) {
      progressContainer.addEventListener('click', (e) => {
        if (!videoEl || !videoEl.duration) return;
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        videoEl.currentTime = pos * videoEl.duration;
      });
    }

    if (btnMute) {
      btnMute.addEventListener('click', () => {
        if (!videoEl) return;
        videoEl.muted = !videoEl.muted;
        this.updateVolumeIcon();
      });
    }

    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        if (!videoEl) return;
        videoEl.volume = parseFloat(e.target.value);
        videoEl.muted = videoEl.volume === 0;
        this.updateVolumeIcon();
      });
    }

    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        this.toggleFullscreen();
      });
    }

    // 4. Custom Video URL Modal
    const btnOpenCustomVideoModal = document.getElementById('btnOpenCustomVideoModal');
    const btnCloseVideoUrlModal = document.getElementById('btnCloseVideoUrlModal');
    const btnCancelVideoUrlModal = document.getElementById('btnCancelVideoUrlModal');
    const videoUrlModal = document.getElementById('videoUrlModal');
    const formCustomVideoUrl = document.getElementById('formCustomVideoUrl');
    const btnResetDefaultVideo = document.getElementById('btnResetDefaultVideo');

    if (btnOpenCustomVideoModal) {
      btnOpenCustomVideoModal.addEventListener('click', () => this.openCustomVideoModal());
    }

    if (btnCloseVideoUrlModal) btnCloseVideoUrlModal.addEventListener('click', () => this.closeCustomVideoModal());
    if (btnCancelVideoUrlModal) btnCancelVideoUrlModal.addEventListener('click', () => this.closeCustomVideoModal());
    if (videoUrlModal) {
      videoUrlModal.addEventListener('click', (e) => {
        if (e.target === videoUrlModal) this.closeCustomVideoModal();
      });
    }

    if (formCustomVideoUrl) {
      formCustomVideoUrl.addEventListener('submit', (e) => {
        e.preventDefault();
        this.applyCustomVideo();
      });
    }

    if (btnResetDefaultVideo) {
      btnResetDefaultVideo.addEventListener('click', () => {
        this.resetToDefaultVideo();
      });
    }
  }

  /**
   * Render the News & Updates list based on selected category
   */
  renderNewsList() {
    const listEl = document.getElementById('landingNewsList');
    if (!listEl) return;

    const filtered = this.newsItems.filter(item => {
      if (this.currentCategory === 'all') return true;
      return item.category === this.currentCategory;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-muted);">
          <div style="font-size:1.8rem; margin-bottom:0.5rem;">📭</div>
          <div style="font-weight:600; font-size:0.95rem;">No notices found for this category.</div>
          <div style="font-size:0.8rem; margin-top:0.25rem;">Select "All Updates" to view all active bulletins.</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(item => `
      <div class="landing-news-item" data-id="${item.id}" title="Click to read full bulletin">
        <div class="landing-news-meta-row">
          <span class="news-tag-badge ${item.badgeClass}">${item.categoryLabel}</span>
          <span class="news-date-text">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            ${item.date}
          </span>
        </div>
        <h3 class="news-item-title">${this.escapeHtml(item.title)}</h3>
        <p class="news-item-excerpt">${this.escapeHtml(item.excerpt)}</p>
        <div class="news-item-footer">
          <span class="news-item-dept">${this.escapeHtml(item.department)}</span>
          <span class="news-read-action">
            Read Bulletin
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
        </div>
      </div>
    `).join('');

    // Bind click events to items
    listEl.querySelectorAll('.landing-news-item').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        const item = this.newsItems.find(n => n.id === id);
        if (item) this.openNewsModal(item);
      });
    });
  }

  /**
   * Render the video playlist selection grid
   */
  renderPlaylistGrid() {
    const gridEl = document.getElementById('videoPlaylistGrid');
    if (!gridEl) return;

    gridEl.innerHTML = this.videoTracks.map((track, idx) => `
      <div class="video-playlist-item ${idx === this.activeTrackIndex ? 'active' : ''}" data-index="${idx}">
        <div class="playlist-item-top">
          <span class="playlist-item-tag">${track.tag}</span>
          <span class="playlist-item-duration">${track.duration}</span>
        </div>
        <div class="playlist-item-title">${this.escapeHtml(track.title)}</div>
      </div>
    `).join('');

    gridEl.querySelectorAll('.video-playlist-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.getAttribute('data-index'), 10);
        this.selectTrack(idx);
      });
    });
  }

  /**
   * Select and load a video track from the playlist
   */
  selectTrack(index) {
    if (index < 0 || index >= this.videoTracks.length) return;
    this.activeTrackIndex = index;
    const track = this.videoTracks[index];

    // Update playlist active classes
    const items = document.querySelectorAll('.video-playlist-item');
    items.forEach((it, idx) => {
      it.classList.toggle('active', idx === index);
    });

    const videoEl = document.getElementById('landingVideoElement');
    const embedContainer = document.getElementById('videoEmbedContainer');
    const embedIframe = document.getElementById('videoEmbedIframe');
    const overlay = document.getElementById('videoOverlay');
    const activeTag = document.getElementById('videoActiveTag');
    const activeTitle = document.getElementById('videoActiveTitle');

    if (activeTag) activeTag.textContent = track.tag;
    if (activeTitle) activeTitle.textContent = track.title;

    if (embedContainer) embedContainer.style.display = 'none';
    if (embedIframe) embedIframe.src = '';
    if (videoEl) {
      videoEl.style.display = 'block';
      videoEl.src = track.src;
      if (track.poster) videoEl.poster = track.poster;
      videoEl.load();
    }

    if (overlay) {
      overlay.classList.remove('hidden');
    }
    this.isPlaying = false;
    this.updatePlayIcons();
  }

  /**
   * Play the current video
   */
  playVideo() {
    const videoEl = document.getElementById('landingVideoElement');
    const overlay = document.getElementById('videoOverlay');

    if (videoEl) {
      videoEl.play().then(() => {
        this.isPlaying = true;
        this.updatePlayIcons();
        if (overlay) overlay.classList.add('hidden');
      }).catch(err => {
        console.warn('Video auto-play prevented or stream error:', err);
      });
    }
  }

  /**
   * Pause the active video
   */
  pauseVideo() {
    const videoEl = document.getElementById('landingVideoElement');
    if (videoEl && !videoEl.paused) {
      videoEl.pause();
      this.isPlaying = false;
      this.updatePlayIcons();
    }
  }

  /**
   * Toggle between Play and Pause
   */
  togglePlayPause() {
    const videoEl = document.getElementById('landingVideoElement');
    if (!videoEl) return;
    if (videoEl.paused || videoEl.ended) {
      this.playVideo();
    } else {
      this.pauseVideo();
    }
  }

  /**
   * Update video progress scrubber and time counters
   */
  updateVideoProgress() {
    const videoEl = document.getElementById('landingVideoElement');
    const progressBar = document.getElementById('videoProgressBar');
    const bufferedBar = document.getElementById('videoProgressBuffered');
    const currentTimeEl = document.getElementById('videoCurrentTime');

    if (!videoEl || !videoEl.duration) return;

    const progress = (videoEl.currentTime / videoEl.duration) * 100;
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (currentTimeEl) currentTimeEl.textContent = this.formatTime(videoEl.currentTime);

    // Buffered range
    if (bufferedBar && videoEl.buffered.length > 0) {
      const bufferedEnd = videoEl.buffered.end(videoEl.buffered.length - 1);
      const bufferedPercent = (bufferedEnd / videoEl.duration) * 100;
      bufferedBar.style.width = `${bufferedPercent}%`;
    }
  }

  updateVideoDuration() {
    const videoEl = document.getElementById('landingVideoElement');
    const durationEl = document.getElementById('videoDuration');
    if (videoEl && durationEl && videoEl.duration) {
      durationEl.textContent = this.formatTime(videoEl.duration);
    }
  }

  onVideoEnded() {
    this.isPlaying = false;
    this.updatePlayIcons();
    const overlay = document.getElementById('videoOverlay');
    if (overlay) overlay.classList.remove('hidden');
  }

  updatePlayIcons() {
    const btnPlayPause = document.getElementById('btnVideoPlayPause');
    if (!btnPlayPause) return;

    if (this.isPlaying) {
      btnPlayPause.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1"></rect>
          <rect x="14" y="4" width="4" height="16" rx="1"></rect>
        </svg>
      `;
      btnPlayPause.title = 'Pause';
    } else {
      btnPlayPause.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      `;
      btnPlayPause.title = 'Play';
    }
  }

  updateVolumeIcon() {
    const videoEl = document.getElementById('landingVideoElement');
    const volumeIcon = document.getElementById('videoVolumeIcon');
    const volumeSlider = document.getElementById('videoVolumeSlider');
    if (!videoEl) return;

    if (volumeSlider) {
      volumeSlider.value = videoEl.muted ? 0 : videoEl.volume;
    }

    if (volumeIcon) {
      if (videoEl.muted || videoEl.volume === 0) {
        volumeIcon.innerHTML = `
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        `;
      } else if (videoEl.volume < 0.5) {
        volumeIcon.innerHTML = `
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        `;
      } else {
        volumeIcon.innerHTML = `
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        `;
      }
    }
  }

  toggleFullscreen() {
    const frame = document.querySelector('.video-player-frame');
    if (!frame) return;

    if (!document.fullscreenElement) {
      if (frame.requestFullscreen) {
        frame.requestFullscreen();
      } else if (frame.webkitRequestFullscreen) {
        frame.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  /**
   * News Detail Modal
   */
  openNewsModal(item) {
    const modal = document.getElementById('newsDetailModal');
    if (!modal) return;

    const badge = document.getElementById('newsModalCategoryBadge');
    const title = document.getElementById('newsModalTitle');
    const date = document.getElementById('newsModalDate');
    const dept = document.getElementById('newsModalDept');
    const ref = document.getElementById('newsModalRef');
    const bodyContent = document.getElementById('newsModalBodyContent');

    if (badge) {
      badge.textContent = item.categoryLabel;
      badge.className = `badge ${item.badgeClass}`;
    }
    if (title) title.textContent = item.title;
    if (date) date.textContent = item.date;
    if (dept) dept.textContent = item.department;
    if (ref) ref.textContent = item.ref;
    if (bodyContent) bodyContent.innerHTML = item.fullContent;

    modal.classList.add('active');
  }

  closeNewsModal() {
    const modal = document.getElementById('newsDetailModal');
    if (modal) modal.classList.remove('active');
  }

  /**
   * Custom Video URL Modal
   */
  openCustomVideoModal() {
    const modal = document.getElementById('videoUrlModal');
    if (modal) {
      modal.classList.add('active');
      const input = document.getElementById('inputVideoUrl');
      if (input) setTimeout(() => input.focus(), 100);
    }
  }

  closeCustomVideoModal() {
    const modal = document.getElementById('videoUrlModal');
    if (modal) modal.classList.remove('active');
  }

  applyCustomVideo() {
    const inputUrl = document.getElementById('inputVideoUrl');
    const inputTitle = document.getElementById('inputVideoTitle');
    const inputTag = document.getElementById('inputVideoTag');

    const url = inputUrl ? inputUrl.value.trim() : '';
    if (!url) return;

    const title = (inputTitle && inputTitle.value.trim()) || 'Custom Video Presentation';
    const tag = (inputTag && inputTag.value.trim()) || 'Custom Media';

    const videoEl = document.getElementById('landingVideoElement');
    const embedContainer = document.getElementById('videoEmbedContainer');
    const embedIframe = document.getElementById('videoEmbedIframe');
    const activeTag = document.getElementById('videoActiveTag');
    const activeTitle = document.getElementById('videoActiveTitle');
    const overlay = document.getElementById('videoOverlay');

    if (activeTag) activeTag.textContent = tag;
    if (activeTitle) activeTitle.textContent = title;

    // Check if YouTube link
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch && ytMatch[1]) {
      const ytId = ytMatch[1];
      if (videoEl) {
        videoEl.pause();
        videoEl.style.display = 'none';
      }
      if (embedContainer && embedIframe) {
        embedContainer.style.display = 'block';
        embedIframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1`;
      }
      if (overlay) overlay.classList.add('hidden');
    } else {
      // Direct MP4 / WebM / Video stream
      if (embedContainer) embedContainer.style.display = 'none';
      if (embedIframe) embedIframe.src = '';
      if (videoEl) {
        videoEl.style.display = 'block';
        videoEl.src = url;
        videoEl.load();
        this.playVideo();
      }
    }

    this.closeCustomVideoModal();
    if (window.nocUI && window.nocUI.showToast) {
      window.nocUI.showToast('Custom video loaded into showcase', 'success');
    }
  }

  resetToDefaultVideo() {
    this.selectTrack(0);
    this.closeCustomVideoModal();
    if (window.nocUI && window.nocUI.showToast) {
      window.nocUI.showToast('Reset to default briefing video track', 'info');
    }
  }

  render() {
    this.renderNewsList();
    this.renderPlaylistGrid();
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Global Landing Showcase instance
window.landingShowcase = new LandingShowcaseManager();
