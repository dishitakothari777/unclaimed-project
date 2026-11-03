// ==========================================================================
// THE UNCLAIMED PROJECT — MASTER JAVASCRIPT
// Modern Creative Editorial Interactions & Animations
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {

    // 1. SCROLL-TRIGGERED REVEAL ANIMATIONS
    const revealElements = document.querySelectorAll('.reveal-on-scroll');
    if ('IntersectionObserver' in window && revealElements.length > 0) {
        const revealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

        revealElements.forEach(el => revealObserver.observe(el));
    } else {
        revealElements.forEach(el => el.classList.add('is-revealed'));
    }

    // 2. ANIMATED NUMERICAL COUNTERS FOR IMPACT SECTION
    const counterElements = document.querySelectorAll('.stat-counter-number[data-target]');
    if ('IntersectionObserver' in window && counterElements.length > 0) {
        const counterObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const target = parseInt(el.getAttribute('data-target'), 10) || 0;
                    animateCounter(el, target);
                    observer.unobserve(el);
                }
            });
        }, { threshold: 0.2 });

        counterElements.forEach(el => counterObserver.observe(el));
    } else {
        counterElements.forEach(el => el.textContent = el.getAttribute('data-target') || el.textContent);
    }

    function animateCounter(el, target) {
        let current = 0;
        const duration = 1600;
        const stepTime = 20;
        const steps = duration / stepTime;
        const increment = target / steps;

        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                el.textContent = target;
                clearInterval(timer);
            } else {
                el.textContent = Math.floor(current);
            }
        }, stepTime);
    }

    // 3. INTERACTIVE BEFORE & AFTER COMPARISON SLIDER
    const baContainers = document.querySelectorAll('.ba-slider-container');
    baContainers.forEach(container => {
        const afterImg = container.querySelector('.ba-slider-after');
        const handle = container.querySelector('.ba-slider-handle');
        if (!afterImg || !handle) return;

        let isDown = false;

        const updatePosition = (clientX) => {
            const rect = container.getBoundingClientRect();
            let x = clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            const percentage = (x / rect.width) * 100;

            afterImg.style.clipPath = `polygon(${percentage}% 0, 100% 0, 100% 100%, ${percentage}% 100%)`;
            handle.style.left = `${percentage}%`;
        };

        handle.addEventListener('mousedown', () => isDown = true);
        window.addEventListener('mouseup', () => isDown = false);
        window.addEventListener('mousemove', (e) => {
            if (isDown) updatePosition(e.clientX);
        });

        // Touch support
        handle.addEventListener('touchstart', () => isDown = true);
        window.addEventListener('touchend', () => isDown = false);
        window.addEventListener('touchmove', (e) => {
            if (isDown && e.touches[0]) updatePosition(e.touches[0].clientX);
        });
    });

    // 4. SHOW/HIDE PASSWORD TOGGLE
    const passwordToggles = document.querySelectorAll('.password-toggle-btn');
    passwordToggles.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target-input');
            const input = document.getElementById(targetId);
            const icon = btn.querySelector('i');
            if (input) {
                if (input.type === 'password') {
                    input.type = 'text';
                    if (icon) {
                        icon.classList.remove('bi-eye');
                        icon.classList.add('bi-eye-slash');
                    }
                } else {
                    input.type = 'password';
                    if (icon) {
                        icon.classList.remove('bi-eye-slash');
                        icon.classList.add('bi-eye');
                    }
                }
            }
        });
    });

    // 5. AJAX LIKE ACTION
    const likeButtons = document.querySelectorAll('.btn-like-project');
    likeButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const projectId = btn.getAttribute('data-project-id');
            const countSpan = btn.querySelector('.like-count');

            try {
                const response = await fetch(`/projects/${projectId}/like`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await response.json();
                if (data.success) {
                    if (countSpan) countSpan.textContent = data.likes_count;
                    btn.classList.add('text-danger');
                    btn.animate([
                        { transform: 'scale(1)' },
                        { transform: 'scale(1.3)' },
                        { transform: 'scale(1)' }
                    ], { duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
                }
            } catch (err) {
                console.error("Error liking project:", err);
            }
        });
    });

    // 6. AJAX BOOKMARK / SAVE TOGGLE
    const bookmarkButtons = document.querySelectorAll('.btn-bookmark-project');
    bookmarkButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const projectId = btn.getAttribute('data-project-id');
            const icon = btn.querySelector('i');
            const textSpan = btn.querySelector('.bm-text');

            try {
                const response = await fetch(`/projects/${projectId}/bookmark`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await response.json();
                if (data.success) {
                    if (data.bookmarked) {
                        btn.classList.remove('btn-outline-warm');
                        btn.classList.add('btn-terracotta');
                        if (icon) {
                            icon.classList.remove('bi-bookmark');
                            icon.classList.add('bi-bookmark-check-fill');
                        }
                        if (textSpan) textSpan.textContent = 'Saved to Studio';
                    } else {
                        btn.classList.remove('btn-terracotta');
                        btn.classList.add('btn-outline-warm');
                        if (icon) {
                            icon.classList.remove('bi-bookmark-check-fill');
                            icon.classList.add('bi-bookmark');
                        }
                        if (textSpan) textSpan.textContent = 'Save Project';
                    }
                }
            } catch (err) {
                console.error("Error saving project:", err);
            }
        });
    });

    // 7. NOTIFICATIONS MARK AS READ
    const markReadButtons = document.querySelectorAll('.btn-mark-read');
    markReadButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const notifId = btn.getAttribute('data-notif-id');
            const card = document.getElementById(`notif-card-${notifId}`);
            try {
                const res = await fetch(`/notifications/${notifId}/read`, { method: 'POST' });
                const data = await res.json();
                if (data.success && card) {
                    card.classList.remove('unread');
                    btn.remove();
                }
            } catch (err) {
                console.error("Error reading notification:", err);
            }
        });
    });

    // 8. LIVE PHOTO PREVIEW
    const fileInput = document.getElementById('primary_image_file');
    const urlInput = document.getElementById('primary_image_url');
    const previewImg = document.getElementById('primary_image_preview');

    if (fileInput && previewImg) {
        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewImg.src = e.target.result;
                    previewImg.classList.remove('d-none');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (urlInput && previewImg) {
        urlInput.addEventListener('input', () => {
            const val = urlInput.value.trim();
            if (val) {
                previewImg.src = val;
                previewImg.classList.remove('d-none');
            }
        });
    }

    // 9. UNSAVED CHANGES WARNING ON CREATE/EDIT FORMS
    const trackForms = document.querySelectorAll('form[data-warn-unsaved="true"]');
    trackForms.forEach(form => {
        let isDirty = false;
        form.addEventListener('input', () => isDirty = true);
        form.addEventListener('submit', () => isDirty = false);

        window.addEventListener('beforeunload', (e) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes in your project form. Are you sure you want to leave?';
            }
        });
    });

    // 10. TASTEFUL WELCOME POP-UP TRIGGER (AFTER LOGIN)
    const welcomeModalEl = document.getElementById('welcomeStudioModal');
    if (welcomeModalEl && welcomeModalEl.getAttribute('data-trigger') === 'true') {
        const welcomeModal = new bootstrap.Modal(welcomeModalEl);
        welcomeModal.show();
    }

    // 11. AUTO DISMISS ALERTS
    const alerts = document.querySelectorAll('.alert.alert-dismissible');
    alerts.forEach(alert => {
        setTimeout(() => {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
            if (bsAlert) bsAlert.close();
        }, 6000);
    });

    console.log("The Unclaimed Project — Modern Creative Editorial Platform Active.");
});
