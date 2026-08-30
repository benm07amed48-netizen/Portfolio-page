/**
 * Modern Portfolio Interactive Engine
 * Handles:
 * - Real-time WebGL Isometric 3D Rubik's Cube with split kinematics & floating pieces
 * - Dynamic Header Scroll Behavior:
 *   * Top bar disappears when scrolling outside the hero section
 *   * Floating center-bottom dock bar slides in at the bottom center
 * - ScrollSpy active section detection
 * - Seamless Light/Dark Theme Switcher with WebGL lighting sync
 * - Live Time Clock (Oran, Algeria UTC+1)
 * - 1-Click Email Clipboard Copy with instant visual feedback
 * - Dynamic File Upload Preview
 */

(function () {
  'use strict';

  // --- Theme Management ---
  const htmlEl = document.documentElement;

  function initTheme() {
    const savedTheme = localStorage.getItem('portfolio_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme ? savedTheme : (prefersDark ? 'dark' : 'light');

    applyTheme(initialTheme);

    // Bind all theme togglers (top header & floating dock)
    document.querySelectorAll('.theme-toggle-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const currentTheme = htmlEl.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
      });
    });
  }

  function applyTheme(theme) {
    htmlEl.setAttribute('data-theme', theme);
    localStorage.setItem('portfolio_theme', theme);
    if (typeof updateThreeTheme === 'function') {
      updateThreeTheme(theme);
    }
  }

  // --- Scroll Header & Floating Center-Bottom Dock Bar Logic ---
  function initScrollNavBehavior() {
    const header = document.querySelector('.site-header');
    const bottomDock = document.getElementById('floating-center-dock');
    const heroSection = document.getElementById('hero') || document.querySelector('.contact-hero-header');

    function checkScroll() {
      const scrollY = window.scrollY || window.pageYOffset;
      const heroThreshold = heroSection ? (heroSection.offsetTop + heroSection.offsetHeight * 0.45) : 280;

      if (scrollY > heroThreshold) {
        if (header) header.classList.add('header-hidden');
        if (bottomDock) bottomDock.classList.add('dock-visible');
      } else {
        if (header) header.classList.remove('header-hidden');
        if (bottomDock) bottomDock.classList.remove('dock-visible');
      }
    }

    window.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();

    // --- ScrollSpy Active Links ---
    const sections = document.querySelectorAll('main > section[id], header, footer');
    const navLinks = document.querySelectorAll('.nav-link, .dock-link-btn');

    function updateScrollSpy() {
      const scrollY = window.scrollY + 200;
      let currentSectionId = '';

      sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
          currentSectionId = section.getAttribute('id');
        }
      });

      if (currentSectionId) {
        navLinks.forEach(link => {
          const href = link.getAttribute('href');
          if (href && (href === `#${currentSectionId}` || href.endsWith(`#${currentSectionId}`))) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    }

    window.addEventListener('scroll', updateScrollSpy, { passive: true });
  }

  // --- 3D Rubik's Cube Engine (Three.js) ---
  let scene, camera, renderer;
  let cubeRootGroup, topHalfGroup, bottomHalfGroup, floatingPiecesGroup, coreGroup, coreMesh, coreGlow;
  let ambientLight, dirLight1, dirLight2, pointLight;
  let floatingPieces = [];
  let isSplit = false;
  let splitProgress = 0;
  let targetSplitProgress = 0;

  let isDragging = false;
  let prevMousePos = { x: 0, y: 0 };
  let targetRotation = { x: 0.38, y: -0.58 };
  let currentRotation = { x: 0.38, y: -0.58 };
  let mouseParallax = { x: 0, y: 0 };
  let targetMouseParallax = { x: 0, y: 0 };
  let threeInitialized = false;

  const PALETTE = {
    bodyDark: 0x1f1510,
    up: 0xfcf5ec,       // Pure Warm Ivory
    down: 0xdf8d27,     // Radiant Amber
    right: 0xd65522,    // Architectural Terracotta
    left: 0x382218,     // Deep Espresso
    front: 0x487f5d,    // Forest Emerald
    back: 0x3f6f96,     // Slate Cobalt
    innerCore: 0xe6772b // Glowing Ember Core
  };

  function updateThreeTheme(theme) {
    if (!scene) return;
    const isDark = theme === 'dark';
    if (ambientLight) {
      ambientLight.color.setHex(isDark ? 0xffdec7 : 0xfff5ea);
      ambientLight.intensity = isDark ? 1.15 : 1.45;
    }
    if (dirLight1) {
      dirLight1.color.setHex(isDark ? 0xffcb9e : 0xffeed8);
      dirLight1.intensity = isDark ? 1.85 : 2.1;
    }
    if (pointLight) {
      pointLight.intensity = isDark ? 4.5 : 3.0;
    }
  }

  function initThree() {
    if (threeInitialized) return;
    const container = document.getElementById('cube-canvas-container');
    const canvas = document.getElementById('cube-canvas');

    if (!container || !canvas) return;
    if (typeof THREE === 'undefined') {
      setTimeout(initThree, 40);
      return;
    }

    threeInitialized = true;
    scene = new THREE.Scene();

    const width = container.clientWidth || 580;
    const height = container.clientHeight || 560;
    const aspect = width / height;
    const d = 3.9;

    camera = new THREE.OrthographicCamera(
      -d * aspect, d * aspect,
      d, -d,
      0.1, 1000
    );
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lights
    ambientLight = new THREE.AmbientLight(0xfff5ea, 1.45);
    scene.add(ambientLight);

    dirLight1 = new THREE.DirectionalLight(0xffeed8, 2.1);
    dirLight1.position.set(16, 26, 16);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    dirLight2 = new THREE.DirectionalLight(0xb86228, 0.95);
    dirLight2.position.set(-16, -12, -16);
    scene.add(dirLight2);

    pointLight = new THREE.PointLight(PALETTE.innerCore, 3.0, 12);
    pointLight.position.set(0, 0, 0);
    scene.add(pointLight);

    buildCubeModel();
    setupCubeInteractions(canvas, container);

    function resizeHandler() {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth || 580;
      const h = container.clientHeight || 380;
      const asp = w / h;
      camera.left = -d * asp;
      camera.right = d * asp;
      camera.top = d;
      camera.bottom = -d;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }

    window.addEventListener('resize', resizeHandler);
    setTimeout(resizeHandler, 80);

    const currentTheme = htmlEl.getAttribute('data-theme') || 'light';
    updateThreeTheme(currentTheme);

    animateCube();
  }

  function buildCubeModel() {
    cubeRootGroup = new THREE.Group();
    scene.add(cubeRootGroup);

    topHalfGroup = new THREE.Group();
    bottomHalfGroup = new THREE.Group();
    floatingPiecesGroup = new THREE.Group();
    coreGroup = new THREE.Group();

    cubeRootGroup.add(topHalfGroup);
    cubeRootGroup.add(bottomHalfGroup);
    cubeRootGroup.add(floatingPiecesGroup);
    cubeRootGroup.add(coreGroup);

    const cubeletSize = 0.92;
    const gap = 0.07;
    const step = cubeletSize + gap;

    function createCubeletMaterials(x, y, z) {
      const blackBody = new THREE.MeshStandardMaterial({
        color: PALETTE.bodyDark,
        roughness: 0.32,
        metalness: 0.2
      });

      const matRight = (x === 1) ? new THREE.MeshStandardMaterial({ color: PALETTE.right, roughness: 0.22, metalness: 0.12 }) : blackBody;
      const matLeft = (x === -1) ? new THREE.MeshStandardMaterial({ color: PALETTE.left, roughness: 0.22, metalness: 0.12 }) : blackBody;
      const matTop = (y === 1) ? new THREE.MeshStandardMaterial({ color: PALETTE.up, roughness: 0.18, metalness: 0.08 }) : blackBody;
      const matBottom = (y === -1) ? new THREE.MeshStandardMaterial({ color: PALETTE.down, roughness: 0.22, metalness: 0.12 }) : blackBody;
      const matFront = (z === 1) ? new THREE.MeshStandardMaterial({ color: PALETTE.front, roughness: 0.22, metalness: 0.12 }) : blackBody;
      const matBack = (z === -1) ? new THREE.MeshStandardMaterial({ color: PALETTE.back, roughness: 0.22, metalness: 0.12 }) : blackBody;

      return [matRight, matLeft, matTop, matBottom, matFront, matBack];
    }

    const geom = new THREE.BoxGeometry(cubeletSize, cubeletSize, cubeletSize);

    // Assemble 3x3x3 Grid
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;

          // Detach 3 asymmetric satellite pieces
          const isSatellitePiece = (x === 1 && y === 1 && z === -1) || 
                                   (x === -1 && y === -1 && z === 1) ||
                                   (x === -1 && y === 1 && z === 1);

          if (isSatellitePiece) {
            const satCubelet = new THREE.Mesh(geom, createCubeletMaterials(x, y, z));
            satCubelet.castShadow = true;
            satCubelet.receiveShadow = true;

            const baseOffset = {
              x: x * step * 1.85 + (x * 0.38),
              y: y * step * 1.85 + (y * 0.38),
              z: z * step * 1.85 + (z * 0.38)
            };

            satCubelet.position.set(baseOffset.x, baseOffset.y, baseOffset.z);
            satCubelet.rotation.set(x * 0.45, y * 0.35, z * 0.5);

            floatingPieces.push({
              mesh: satCubelet,
              baseX: baseOffset.x,
              baseY: baseOffset.y,
              baseZ: baseOffset.z,
              speed: 0.85 + Math.random() * 0.5,
              rotSpeedX: (Math.random() - 0.5) * 0.012,
              rotSpeedY: (Math.random() - 0.5) * 0.012,
              phase: Math.random() * Math.PI * 2
            });

            floatingPiecesGroup.add(satCubelet);
          } else {
            const cubelet = new THREE.Mesh(geom, createCubeletMaterials(x, y, z));
            cubelet.castShadow = true;
            cubelet.receiveShadow = true;
            cubelet.position.set(x * step, y * step, z * step);

            if (y > 0 || (y === 0 && x + z >= 0)) {
              topHalfGroup.add(cubelet);
            } else {
              bottomHalfGroup.add(cubelet);
            }
          }
        }
      }
    }

    // Orbiting satellite pieces
    const extraGeom = new THREE.BoxGeometry(cubeletSize * 0.78, cubeletSize * 0.78, cubeletSize * 0.78);
    const extraOffsets = [
      { x: 2.35, y: -1.75, z: 1.95 },
      { x: -2.45, y: 1.95, z: -1.75 },
      { x: 1.75, y: 2.45, z: 2.15 }
    ];

    extraOffsets.forEach((pos, idx) => {
      const extraMat = [
        new THREE.MeshStandardMaterial({ color: PALETTE.right, roughness: 0.25 }),
        new THREE.MeshStandardMaterial({ color: PALETTE.left, roughness: 0.25 }),
        new THREE.MeshStandardMaterial({ color: PALETTE.up, roughness: 0.2 }),
        new THREE.MeshStandardMaterial({ color: PALETTE.down, roughness: 0.25 }),
        new THREE.MeshStandardMaterial({ color: PALETTE.front, roughness: 0.25 }),
        new THREE.MeshStandardMaterial({ color: PALETTE.back, roughness: 0.25 })
      ];
      const mesh = new THREE.Mesh(extraGeom, extraMat);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.castShadow = true;

      floatingPieces.push({
        mesh: mesh,
        baseX: pos.x,
        baseY: pos.y,
        baseZ: pos.z,
        speed: 0.95 + idx * 0.25,
        rotSpeedX: 0.007,
        rotSpeedY: 0.01,
        phase: idx * 1.6
      });
      floatingPiecesGroup.add(mesh);
    });

    // Glowing Inner Core Orb
    const coreGeom = new THREE.IcosahedronGeometry(0.58, 3);
    const coreMat = new THREE.MeshStandardMaterial({
      color: PALETTE.innerCore,
      emissive: PALETTE.innerCore,
      emissiveIntensity: 1.5,
      roughness: 0.1,
      metalness: 0.7
    });
    coreMesh = new THREE.Mesh(coreGeom, coreMat);
    coreGroup.add(coreMesh);

    const glowGeom = new THREE.SphereGeometry(0.78, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: PALETTE.innerCore,
      transparent: true,
      opacity: 0.28,
      wireframe: true
    });
    coreGlow = new THREE.Mesh(glowGeom, glowMat);
    coreGroup.add(coreGlow);
  }

  function setupCubeInteractions(canvas, container) {
    const logoBtns = document.querySelectorAll('.logo-btn, .dock-logo-btn');
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('mousemove', (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      targetMouseParallax.x = nx * 0.15;
      targetMouseParallax.y = -ny * 0.15;
    });

    let dragDistance = 0;

    // Inertia drag on canvas
    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragDistance = 0;
      prevMousePos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMousePos.x;
      const deltaY = e.clientY - prevMousePos.y;
      dragDistance += Math.abs(deltaX) + Math.abs(deltaY);

      targetRotation.y += deltaX * 0.008;
      targetRotation.x += deltaY * 0.008;
      targetRotation.x = Math.max(-0.6, Math.min(1.2, targetRotation.x));

      prevMousePos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Touch support
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        dragDistance = 0;
        prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - prevMousePos.x;
      const deltaY = e.touches[0].clientY - prevMousePos.y;
      dragDistance += Math.abs(deltaX) + Math.abs(deltaY);

      targetRotation.y += deltaX * 0.008;
      targetRotation.x += deltaY * 0.008;
      targetRotation.x = Math.max(-0.6, Math.min(1.2, targetRotation.x));

      prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isDragging = false;
    });

    function toggleSplit() {
      isSplit = !isSplit;
      targetSplitProgress = isSplit ? 1.0 : 0.0;
    }

    function handleCubeClick(clientX, clientY) {
      if (dragDistance > 8) return; // Ignore drag operations

      const rect = canvas.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // Check if clicking on the glowing core
      if (coreGroup) {
        const coreIntersects = raycaster.intersectObjects(coreGroup.children, true);
        if (coreIntersects.length > 0 || (isSplit && Math.hypot(mouse.x, mouse.y) < 0.28)) {
          const aboutSection = document.getElementById('about');
          if (aboutSection) {
            aboutSection.scrollIntoView({ behavior: 'smooth' });
            return;
          }
        }
      }

      // If clicked on the cube body
      if (cubeRootGroup) {
        const cubeIntersects = raycaster.intersectObjects(cubeRootGroup.children, true);
        if (cubeIntersects.length > 0) {
          toggleSplit();
          return;
        }
      }

      // Default toggle split on click
      toggleSplit();
    }

    canvas.addEventListener('click', (e) => {
      handleCubeClick(e.clientX, e.clientY);
    });

    canvas.addEventListener('touchend', (e) => {
      if (e.changedTouches && e.changedTouches.length === 1) {
        handleCubeClick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      }
    });

    logoBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const aboutSec = document.getElementById('about');
        if (aboutSec && (window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/'))) {
          e.preventDefault();
          aboutSec.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  let clock;

  function animateCube() {
    requestAnimationFrame(animateCube);
    if (!clock && typeof THREE !== 'undefined') {
      clock = new THREE.Clock();
    }
    if (!clock || !scene || !renderer || !camera) return;

    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();

    currentRotation.x += (targetRotation.x - currentRotation.x) * 0.08;
    currentRotation.y += (targetRotation.y - currentRotation.y) * 0.08;

    mouseParallax.x += (targetMouseParallax.x - mouseParallax.x) * 0.05;
    mouseParallax.y += (targetMouseParallax.y - mouseParallax.y) * 0.05;

    splitProgress += (targetSplitProgress - splitProgress) * 0.08;

    if (cubeRootGroup) {
      if (!isDragging) {
        targetRotation.y += 0.0025;
      }
      cubeRootGroup.rotation.x = currentRotation.x + mouseParallax.y;
      cubeRootGroup.rotation.y = currentRotation.y + mouseParallax.x;
      cubeRootGroup.position.y = Math.sin(elapsedTime * 1.5) * 0.08;
    }

    if (topHalfGroup && bottomHalfGroup) {
      const topY = splitProgress * 1.4;
      const topX = splitProgress * 0.35;
      const topRotZ = splitProgress * 0.28;
      const topRotX = -splitProgress * 0.18;

      topHalfGroup.position.set(topX, topY, 0);
      topHalfGroup.rotation.set(topRotX, 0, topRotZ);

      const bottomY = -splitProgress * 1.4;
      const bottomX = -splitProgress * 0.35;
      const bottomRotZ = -splitProgress * 0.28;
      const bottomRotX = splitProgress * 0.18;

      bottomHalfGroup.position.set(bottomX, bottomY, 0);
      bottomHalfGroup.rotation.set(bottomRotX, 0, bottomRotZ);
    }

    floatingPieces.forEach((piece) => {
      const bob = Math.sin(elapsedTime * piece.speed + piece.phase) * 0.18;
      const expand = splitProgress * 0.85;

      const dirX = Math.sign(piece.baseX) || 1;
      const dirY = Math.sign(piece.baseY) || 1;
      const dirZ = Math.sign(piece.baseZ) || 1;

      piece.mesh.position.x = piece.baseX + (dirX * expand);
      piece.mesh.position.y = piece.baseY + bob + (dirY * expand);
      piece.mesh.position.z = piece.baseZ + (dirZ * expand);

      piece.mesh.rotation.x += piece.rotSpeedX;
      piece.mesh.rotation.y += piece.rotSpeedY;
    });

    if (coreGroup && coreMesh) {
      coreMesh.rotation.y = elapsedTime * 1.2;
      coreMesh.rotation.x = elapsedTime * 0.8;
      if (coreGlow) {
        coreGlow.rotation.y = -elapsedTime * 0.6;
        const pulse = 0.85 + Math.sin(elapsedTime * 4.0) * 0.15;
        coreGlow.scale.set(pulse, pulse, pulse);
      }
      coreGroup.scale.setScalar(0.2 + splitProgress * 0.95);
      pointLight.intensity = 1.0 + splitProgress * 4.5;
    }

    renderer.render(scene, camera);
  }

  // --- Horizontal Journey Roadmap Scroller with Mouse Wheel & Timeline Sync ---
  function initHorizontalJourneyScroller() {
    const section = document.getElementById('journey');
    const track = document.getElementById('journey-track-viewport');
    const prevBtn = document.getElementById('journey-prev-btn');
    const nextBtn = document.getElementById('journey-next-btn');
    const cards = document.querySelectorAll('.journey-phase-card');
    const milestones = document.querySelectorAll('.ruler-milestone');
    const progressLine = document.getElementById('ruler-progress-line');
    const timelineRuler = document.getElementById('journey-timeline-ruler');

    if (!track) return;

    // 1. Navigation Button Handlers
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        track.scrollBy({ left: -376, behavior: 'smooth' });
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        track.scrollBy({ left: 376, behavior: 'smooth' });
      });
    }

    // 2. Mouse Wheel Interception & Smooth Horizontal Translation
    let isWheeling = false;
    let targetScrollLeft = track.scrollLeft;

    function smoothWheelScroll() {
      if (!isWheeling) return;
      const current = track.scrollLeft;
      const diff = targetScrollLeft - current;
      if (Math.abs(diff) > 0.5) {
        track.scrollLeft += diff * 0.18;
        requestAnimationFrame(smoothWheelScroll);
      } else {
        track.scrollLeft = targetScrollLeft;
        isWheeling = false;
      }
    }

    const scrollTargetContainer = section || track;
    scrollTargetContainer.addEventListener('wheel', (e) => {
      const maxScroll = track.scrollWidth - track.clientWidth;
      if (maxScroll <= 0) return;

      const isScrollingDown = e.deltaY > 0;
      const isScrollingUp = e.deltaY < 0;

      // Intercept only when within horizontal bounds
      if ((isScrollingDown && track.scrollLeft < maxScroll - 4) ||
          (isScrollingUp && track.scrollLeft > 4)) {
        e.preventDefault();
        targetScrollLeft = Math.max(0, Math.min(maxScroll, (isWheeling ? targetScrollLeft : track.scrollLeft) + e.deltaY * 1.5));
        if (!isWheeling) {
          isWheeling = true;
          requestAnimationFrame(smoothWheelScroll);
        }
      }
    }, { passive: false });

    // 3. Drag-to-Scroll Support with Momentum
    let isTrackDragging = false;
    let startX = 0;
    let startScrollLeft = 0;

    track.addEventListener('mousedown', (e) => {
      isTrackDragging = true;
      startX = e.pageX - track.offsetLeft;
      startScrollLeft = track.scrollLeft;
      targetScrollLeft = track.scrollLeft;
      isWheeling = false;
      track.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
      if (isTrackDragging) {
        isTrackDragging = false;
        if (track) track.style.cursor = 'grab';
      }
    });

    track.addEventListener('mousemove', (e) => {
      if (!isTrackDragging) return;
      e.preventDefault();
      const x = e.pageX - track.offsetLeft;
      const walk = (x - startX) * 1.8;
      track.scrollLeft = startScrollLeft - walk;
      targetScrollLeft = track.scrollLeft;
    });

    // Touch events for mobile/tablet swipe
    let touchStartX = 0;
    let touchStartScroll = 0;
    track.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartScroll = track.scrollLeft;
      }
    }, { passive: true });

    track.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - touchStartX;
        track.scrollLeft = touchStartScroll - deltaX;
      }
    }, { passive: true });

    // 4. Milestone Click-to-Jump
    milestones.forEach((ms, idx) => {
      ms.addEventListener('click', () => {
        if (cards[idx]) {
          const cardLeft = cards[idx].offsetLeft - (cards[0] ? cards[0].offsetLeft : 0);
          track.scrollTo({ left: cardLeft, behavior: 'smooth' });
        }
      });
    });

    // 5. Active Phase & Timeline Progress Line Synchronizer
    function updateTimelineAndActivePhase() {
      const scrollPos = track.scrollLeft;
      const maxScroll = Math.max(1, track.scrollWidth - track.clientWidth);
      const scrollRatio = Math.max(0, Math.min(1, scrollPos / maxScroll));

      // Update Sliding Progress Line on Timeline
      if (progressLine && timelineRuler) {
        const totalRulerWidth = timelineRuler.offsetWidth || 1700;
        const tracerTravel = Math.max(0, totalRulerWidth - 80);
        progressLine.style.transform = `translateX(${scrollRatio * tracerTravel}px)`;
      }

      // Calculate which card is currently in view
      let activeIndex = 0;
      let minDistance = Infinity;

      cards.forEach((card, idx) => {
        const cardLeft = card.offsetLeft - (cards[0] ? cards[0].offsetLeft : 0);
        const dist = Math.abs(cardLeft - scrollPos);
        if (dist < minDistance) {
          minDistance = dist;
          activeIndex = idx;
        }
      });

      // Update Card Active States
      cards.forEach((card, idx) => {
        if (idx === activeIndex) {
          card.classList.add('is-active-phase');
        } else {
          card.classList.remove('is-active-phase');
        }
      });

      // Update Milestone Active States
      milestones.forEach((ms, idx) => {
        if (idx === activeIndex) {
          ms.classList.add('is-active');
        } else {
          ms.classList.remove('is-active');
        }
      });
    }

    track.addEventListener('scroll', updateTimelineAndActivePhase, { passive: true });
    updateTimelineAndActivePhase();
  }

  // --- Spinning Article Dial & Reader Modal ---
  function initArticleDialInteractions() {
    const wheel = document.getElementById('article-dial-wheel');
    const modal = document.getElementById('article-reader-modal');
    const closeBtn = document.getElementById('modal-close-btn');
    const modalTag = document.getElementById('modal-article-tag');
    const modalTitle = document.getElementById('modal-article-title');
    const modalBody = document.getElementById('modal-article-body');

    const articlesData = {
      1: {
        tag: 'Backend Mindset',
        title: 'Why I Chose Backend Development: The Myth of Artistic Talent',
        body: '<p>When I started programming, I worried about lacking an artistic eye for visual aesthetics or color combinations. I soon realized building software doesn\'t require being a visual artist; companies rely on dedicated UI/UX designers for visual interfaces, while a backend developer builds the internal engine, scalable endpoints, and reliable data pipelines.</p><p style="margin-top: 14px;">Focusing purely on logic, structured algorithms, database normalization, and system reliability was the best decision for my engineering foundation.</p>'
      },
      2: {
        tag: 'Frontend Pragmatism',
        title: 'The Only Frontend Basics a Backend Developer Actually Needs',
        body: '<p>You do not need to master complex client-side framework lifecycles or state libraries like Redux to be an exceptional backend engineer. Understanding fundamental semantic HTML, basic DOM structure, and how fetch/XHR requests transmit JSON payloads is sufficient to build functional administrative consoles, prototype internal dashboards, and debug full-stack communication.</p><p style="margin-top: 14px;">By keeping frontend dependencies minimal and leveraging structured API specifications like OpenAPI, the backend engineer delivers maximum business value with minimum bloat.</p>'
      },
      3: {
        tag: 'Systems & Scalability',
        title: 'Building Robust APIs: From Monoliths to Modular Services',
        body: '<p>In modern software architecture, starting with a clean, modular monolith is almost always superior to premature microservice fragmentation. By isolating domain logic into decoupled packages and enforcing strict API contracts, we maintain high engineering velocity while retaining the simplicity of single-unit deployments.</p>'
      }
    };

    if (wheel) {
      const nodes = wheel.querySelectorAll('.dial-card-node');
      nodes.forEach(node => {
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          const artId = node.getAttribute('data-article-id') || '1';
          const data = articlesData[artId] || articlesData[1];

          if (modal && modalTag && modalTitle && modalBody) {
            modalTag.textContent = data.tag;
            modalTitle.textContent = data.title;
            modalBody.innerHTML = data.body;
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
          }
        });
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('is-open');
          modal.setAttribute('aria-hidden', 'true');
        }
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) {
          modal.classList.remove('is-open');
          modal.setAttribute('aria-hidden', 'true');
        }
      });
    }
  }

  // --- 3D Metallic Contact Coin Interactions ---
  function initContactCoin3D() {
    const coin = document.getElementById('contact-coin-3d');
    if (!coin) return;

    coin.addEventListener('mousemove', (e) => {
      const rect = coin.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      coin.style.transform = `translateY(-10px) rotateY(${x * 0.4}deg) rotateX(${-y * 0.4}deg) scale(1.06)`;
    });

    coin.addEventListener('mouseleave', () => {
      coin.style.transform = '';
    });

    coin.addEventListener('click', () => {
      const contactTarget = document.getElementById('contact') || document.querySelector('footer');
      if (contactTarget) {
        contactTarget.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // --- Contact Page Utilities & Clocks ---
  function initContactPageHelpers() {
    const clocks = document.querySelectorAll('#algeria-clock, #live-oran-time');
    if (clocks.length > 0) {
      function updateClock() {
        const options = {
          timeZone: 'Africa/Algiers',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        };
        const formatter = new Intl.DateTimeFormat([], options);
        const timeStr = formatter.format(new Date());
        clocks.forEach(clk => { clk.textContent = timeStr; });
      }
      updateClock();
      setInterval(updateClock, 1000);
    }

    const copyEmailBtn = document.getElementById('copy-email-btn');
    const emailToCopy = document.getElementById('email-address-text') || document.getElementById('email-text-val');
    const copyLabel = document.getElementById('copy-btn-label');

    if (copyEmailBtn && emailToCopy) {
      copyEmailBtn.addEventListener('click', async () => {
        const text = emailToCopy.textContent.trim();
        try {
          await navigator.clipboard.writeText(text);
          if (copyLabel) copyLabel.textContent = '✓ Copied!';
          copyEmailBtn.style.background = 'var(--accent-secondary)';
          copyEmailBtn.style.color = '#ffffff';
          setTimeout(() => {
            if (copyLabel) copyLabel.textContent = 'Copy';
            copyEmailBtn.style.background = '';
            copyEmailBtn.style.color = '';
          }, 2200);
        } catch (err) {
          console.error('Clipboard copy failed', err);
        }
      });
    }

    const fileInput = document.getElementById('attach');
    const fileNameSpan = document.getElementById('selected-file-name');
    if (fileInput && fileNameSpan) {
      fileInput.addEventListener('change', function () {
        if (this.files && this.files.length > 0) {
          fileNameSpan.textContent = `📎 ${this.files[0].name} (${Math.round(this.files[0].size / 1024)} KB)`;
          fileNameSpan.style.color = 'var(--accent-primary)';
          fileNameSpan.style.fontWeight = '600';
        } else {
          fileNameSpan.textContent = 'No file attached';
          fileNameSpan.style.color = 'var(--text-muted)';
        }
      });
    }
  }

  // --- Project Domain Filter Logic ---
  function initProjectFilters() {
    const filterBar = document.getElementById('projects-filter-bar');
    const cards = document.querySelectorAll('#projects-container .project-card');
    if (!filterBar || cards.length === 0) return;

    const chips = filterBar.querySelectorAll('.filter-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const selectedCat = chip.getAttribute('data-category') || 'all';

        cards.forEach(card => {
          const cardCat = card.getAttribute('data-category') || 'all';
          if (selectedCat === 'all' || cardCat === selectedCat) {
            card.style.display = 'flex';
            setTimeout(() => {
              card.style.opacity = '1';
              card.style.transform = 'translateY(0) scale(1)';
            }, 20);
          } else {
            card.style.opacity = '0';
            card.style.transform = 'translateY(12px) scale(0.96)';
            setTimeout(() => {
              card.style.display = 'none';
            }, 280);
          }
        });
      });
    });
  }

  // DOM Ready & Window Load
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initScrollNavBehavior();
    initThree();
    initHorizontalJourneyScroller();
    initArticleDialInteractions();
    initContactCoin3D();
    initContactPageHelpers();
    initProjectFilters();
  });

  window.addEventListener('load', () => {
    if (!threeInitialized) {
      initThree();
    }
  });

})();
