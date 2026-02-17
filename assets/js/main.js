/* ============================================================
   GINO OSTOLAZA - Main JavaScript
   Handles: Loading, Particles, Animations, Navigation,
            Carousel, Counters, Scroll-to-Top, Dolar API
   ============================================================ */

(function () {
  'use strict';

  // --- Loading Screen ---
  window.addEventListener('load', () => {
    const loader = document.getElementById('loader');
    if (loader) {
      setTimeout(() => loader.classList.add('hidden'), 600);
    }
  });

  // --- Particle Background ---
  function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationId;
    let width, height;

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }

    function createParticle() {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
      };
    }

    function init() {
      resize();
      const count = Math.min(Math.floor((width * height) / 15000), 80);
      particles = Array.from({ length: count }, createParticle);
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(59, 130, 246, ${p.opacity})`;
        ctx.fill();
      });

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(59, 130, 246, ${0.08 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animationId = requestAnimationFrame(draw);
    }

    init();
    draw();

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        cancelAnimationFrame(animationId);
        init();
        draw();
      }, 200);
    });
  }

  // --- Scroll Animations (Intersection Observer) ---
  function initScrollAnimations() {
    const elements = document.querySelectorAll('[data-animate]');
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const delay = entry.target.dataset.delay || 0;
            setTimeout(() => {
              entry.target.classList.add('animated');
            }, parseInt(delay));
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    elements.forEach((el) => observer.observe(el));
  }

  // --- Animated Counters ---
  function initCounters() {
    const counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const target = parseInt(el.dataset.count);
            let current = 0;
            const increment = target / 40;
            const duration = 1500;
            const stepTime = duration / 40;

            const timer = setInterval(() => {
              current += increment;
              if (current >= target) {
                current = target;
                clearInterval(timer);
              }
              el.textContent = Math.floor(current);
            }, stepTime);

            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach((el) => observer.observe(el));
  }

  // --- Navigation ---
  function initNavigation() {
    const navbar = document.getElementById('navbar');
    const toggle = document.getElementById('menu-btn');
    const navLinks = document.getElementById('nav-links');
    const links = document.querySelectorAll('.nav-link');

    // Scroll effect
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
      if (navbar) {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
      }
      lastScroll = window.scrollY;
    });

    // Hamburger toggle
    if (toggle && navLinks) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle.classList.toggle('active');
        navLinks.classList.toggle('active');
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (
          navLinks.classList.contains('active') &&
          !navLinks.contains(e.target) &&
          !toggle.contains(e.target)
        ) {
          toggle.classList.remove('active');
          navLinks.classList.remove('active');
        }
      });
    }

    // Smooth scroll + close menu on link click
    links.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href').substring(1);
        const targetEl = document.getElementById(targetId);
        if (!targetEl) return;

        const navHeight = navbar ? navbar.offsetHeight : 70;
        const pos = targetEl.getBoundingClientRect().top + window.pageYOffset - navHeight - 10;

        window.scrollTo({ top: pos, behavior: 'smooth' });

        if (toggle && navLinks) {
          toggle.classList.remove('active');
          navLinks.classList.remove('active');
        }
      });
    });

    // Active link highlighting on scroll
    const sections = document.querySelectorAll('section[id], header[id]');
    window.addEventListener('scroll', () => {
      const scrollPos = window.scrollY + 200;
      sections.forEach((section) => {
        const top = section.offsetTop;
        const height = section.offsetHeight;
        const id = section.getAttribute('id');
        const link = document.querySelector(`.nav-link[href="#${id}"]`);

        if (link) {
          if (scrollPos >= top && scrollPos < top + height) {
            links.forEach((l) => l.classList.remove('active'));
            link.classList.add('active');
          }
        }
      });
    });
  }

  // --- Testimonial Carousel ---
  function initCarousel() {
    const slides = document.querySelectorAll('.testimonial-slide');
    const dotsContainer = document.querySelector('.testimonial-dots');
    const prevBtn = document.querySelector('.carousel-prev');
    const nextBtn = document.querySelector('.carousel-next');

    if (!slides.length) return;

    let current = 0;
    let autoPlayInterval;

    // Create dots
    if (dotsContainer) {
      slides.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.classList.add('testimonial-dot');
        if (i === 0) dot.classList.add('active');
        dot.setAttribute('aria-label', `Testimonio ${i + 1}`);
        dot.addEventListener('click', () => goTo(i));
        dotsContainer.appendChild(dot);
      });
    }

    function goTo(index) {
      slides[current].classList.remove('active');
      const dots = document.querySelectorAll('.testimonial-dot');
      if (dots[current]) dots[current].classList.remove('active');

      current = (index + slides.length) % slides.length;

      slides[current].classList.add('active');
      if (dots[current]) dots[current].classList.add('active');

      resetAutoPlay();
    }

    function resetAutoPlay() {
      clearInterval(autoPlayInterval);
      autoPlayInterval = setInterval(() => goTo(current + 1), 5000);
    }

    if (prevBtn) prevBtn.addEventListener('click', () => goTo(current - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => goTo(current + 1));

    goTo(0);
    resetAutoPlay();
  }

  // --- Scroll to Top ---
  function initScrollToTop() {
    const btn = document.getElementById('scroll-top');
    if (!btn) return;

    window.addEventListener('scroll', () => {
      btn.classList.toggle('visible', window.scrollY > 500);
    });

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // --- Dolar Blue API ---
  async function fetchDolarBlue() {
    const el = document.getElementById('usd-ars');
    if (!el) return;

    try {
      const response = await fetch('https://api.bluelytics.com.ar/v2/latest');
      const data = await response.json();
      const venta = data.blue.value_sell;
      el.textContent = `Dolar Blue hoy (venta): $${venta.toFixed(2)} ARS`;
    } catch (error) {
      el.textContent = 'Error cargando dolar blue.';
      console.error('Dolar API error:', error);
    }
  }

  // --- Footer Year ---
  function initFooterYear() {
    const el = document.getElementById('anio-actual');
    if (el) el.textContent = new Date().getFullYear();
  }

  // --- Brand link smooth scroll ---
  function initBrandLink() {
    const brand = document.querySelector('.nav-brand');
    if (brand) {
      brand.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  // --- Initialize Everything ---
  document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initScrollAnimations();
    initCounters();
    initNavigation();
    initCarousel();
    initScrollToTop();
    initBrandLink();
    fetchDolarBlue();
    initFooterYear();
  });
})();
