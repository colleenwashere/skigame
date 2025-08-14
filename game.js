/*
 * Ski Adventure Game – Realistic Edition
 *
 * This game uses high‑quality illustrations for the skier, obstacles and fish
 * instead of pixel art.  Catching a fish pauses the game and shows a large
 * overlay with a baseball player delivering the catch message.  Press the
 * space bar to dismiss the overlay and resume play.  A scoreboard in the
 * lower left keeps track of how many fish you've caught and your current
 * level.  Difficulty increases every five fish by speeding up the scroll
 * and spawning more obstacles and fish.
 */

(function() {
  // -------------------------------------------------------------------------
  // Configuration constants
  // -------------------------------------------------------------------------

  // Base scrolling speed (pixels per frame) and spawn chances for level 1.
  const BASE_SCROLL = 2;
  // Reduce spawn probabilities slightly so the playfield doesn't become
  // overcrowded with fish and obstacles.  These values are tweaked
  // empirically to provide adequate room for manoeuvring.
  const BASE_FISH_SPAWN = 0.005;
  const BASE_OBSTACLE_SPAWN = 0.007;
  // How much to increase scrolling speed and spawn probability each level.
  const SCROLL_INCREASE_PER_LEVEL = 0.5;
  const OBSTACLE_SPAWN_INCREASE_PER_LEVEL = 0.003;
  const FISH_SPAWN_INCREASE_PER_LEVEL = 0.001;
  // Number of fish catches required to advance to the next level.
  const FISHES_PER_LEVEL = 5;
  // Scale factors used to size our bitmaps on the canvas.  These values
  // multiply the natural width/height of each image when drawing.
  // Scale down all sprites to free up more space on the hill.  These
  // multipliers apply to the natural image sizes and were chosen to
  // restore playability after the earlier large images.  Smaller
  // factors result in smaller on‑screen sprites.
  // Make the player avatar smaller than other icons.  The skier
  // should be noticeably smaller than the fish and obstacles to
  // reinforce a sense of scale and ensure ample room to manoeuvre.
  const PLAYER_SCALE   = 0.05;
  const OBSTACLE_SCALE = 0.08;
  const FISH_SCALE     = 0.07;
  // Horizontal movement speed of the player (pixels per frame).
  const PLAYER_SPEED = 6;

  // -------------------------------------------------------------------------
  // Game state variables
  // -------------------------------------------------------------------------

  let canvas, ctx, width, height;
  const player = { x: 0, y: 0, dx: 0 };
  const fishes = [];
  const obstacles = [];
  let score = 0;
  let level = 1;
  let flashFrames = 0;
  let running = true;
  let gamePaused = false;

  // Object to hold loaded image assets.  Keys correspond to the files
  // stored in /images.
  const images = {};
  // Species definitions map names to image keys.  When spawning fish we
  // choose one of these at random.
  const speciesList = [
    { name: 'Chinook salmon', key: 'salmon' },
    { name: 'Coho salmon',    key: 'salmon' },
    { name: 'Steelhead',      key: 'steelhead' },
    { name: 'Sturgeon',       key: 'sturgeon' },
    { name: 'Smallmouth bass',key: 'bass' },
    { name: 'Largemouth bass',key: 'bass' },
    { name: 'Crappie',        key: 'panfish' },
    { name: 'Bluegill',       key: 'panfish' },
    { name: 'Walleye',        key: 'panfish' },
    { name: 'Catfish',        key: 'catfish' },
    { name: 'Carp',           key: 'catfish' },
    { name: 'Sucker',         key: 'catfish' },
    { name: 'Pikeminnow',     key: 'panfish' },
    { name: 'Peamouth',       key: 'panfish' }
  ];

  // Messages from colleagues that are shown when you level up.  Feel free
  // to edit this array to include additional well‑wishes or inside jokes.
  const teamMessages = [
    "Sean and Kim - it's feeling kind of like a \"when it rain it pours\" kind of week for you, so just know that we're all behind you and here for you! - Colleen",
    // Additional messages can be added here.  They will cycle through as
    // you progress through the levels.
    "Great job! Keep your balance and enjoy the ride!",
    "You're doing awesome – the mountain's no match for you!"
  ];
  let teamMsgIndex = 0;
  let pendingLevelUpMessage = null;

  // -------------------------------------------------------------------------
  // Helper functions
  // -------------------------------------------------------------------------

  /** Load all artwork into the images object.  Returns a Promise that
   * resolves when all files have finished loading. */
  function loadImages() {
    const toLoad = {
      skier:    'images/skier.png',
      tree:     'images/tree.png',
      snowman:  'images/snowman.png',
      baseball: 'images/baseball_player.png',
      lab:      'images/lab_miata.png',
      salmon:   'images/salmon.png',
      steelhead:'images/steelhead.png',
      sturgeon: 'images/sturgeon.png',
      bass:     'images/bass.png',
      panfish:  'images/panfish.png',
      catfish:  'images/catfish.png'
    };
    const promises = [];
    for (const key in toLoad) {
      promises.push(new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { images[key] = img; resolve(); };
        img.onerror = () => reject(new Error('Failed to load image: ' + toLoad[key]));
        img.src = toLoad[key];
      }));
    }
    return Promise.all(promises);
  }

  /** Update the scoreboard text to reflect the current score and level. */
  function updateScoreboard() {
    const el = document.getElementById('scoreboard');
    if (el) {
      el.textContent = `Fish: ${score} | Level: ${level}`;
    }
  }

  /** Compute the current scrolling speed based on the level. */
  function currentScrollSpeed() {
    return BASE_SCROLL + (level - 1) * SCROLL_INCREASE_PER_LEVEL;
  }
  /** Compute fish spawn probability for this frame. */
  function currentFishSpawnChance() {
    return BASE_FISH_SPAWN + (level - 1) * FISH_SPAWN_INCREASE_PER_LEVEL;
  }
  /** Compute obstacle spawn probability for this frame. */
  function currentObstacleSpawnChance() {
    return BASE_OBSTACLE_SPAWN + (level - 1) * OBSTACLE_SPAWN_INCREASE_PER_LEVEL;
  }

  /** Spawn a new fish entity at the top of the canvas. */
  function spawnFish() {
    const spec = speciesList[Math.floor(Math.random() * speciesList.length)];
    const img = images[spec.key];
    if (!img) return;
    const w = img.width * FISH_SCALE;
    const h = img.height * FISH_SCALE;
    fishes.push({
      x: Math.random() * (width - w) + w / 2,
      y: -h / 2,
      species: spec,
      img: img,
      w: w,
      h: h
    });
  }

  /** Spawn a new obstacle (tree or snowman) at the top of the canvas. */
  function spawnObstacle() {
    const chooseTree = Math.random() < 0.6;
    const img = chooseTree ? images.tree : images.snowman;
    if (!img) return;
    const w = img.width * OBSTACLE_SCALE;
    const h = img.height * OBSTACLE_SCALE;
    obstacles.push({
      x: Math.random() * (width - w),
      y: -h,
      img: img,
      w: w,
      h: h
    });
  }

  /** Handle catching a fish: increment score, level up, update scoreboard
   * and pause the game to show a message. */
  function handleFishCatch(fish) {
    // Record previous level before incrementing the score
    const prevLevel = level;
    score++;
    // Determine whether we've reached a new level.  Levels are not reduced
    // on collision hits; they are only increased here based on catches.
    if (score > 0 && score % FISHES_PER_LEVEL === 0) {
      level++;
    }
    updateScoreboard();
    // Queue up a level‑up message if a new level was reached.  We defer
    // showing this message until after the current overlay is dismissed.
    if (level > prevLevel) {
      const msg = teamMessages[teamMsgIndex % teamMessages.length];
      teamMsgIndex = (teamMsgIndex + 1) % teamMessages.length;
      pendingLevelUpMessage = msg;
    }
    // Show the fish catch overlay using the baseball image
    pauseGame(`You caught a ${fish.species.name}!`, 'baseball');
  }

  /** Handle hitting an obstacle: flash the screen red briefly. */
  function handleObstacleHit() {
    flashFrames = 15;
    // Penalise the player by decreasing score.  Ensure it never drops
    // below zero.  Levels are NOT reduced on collision; once a level
    // has been reached it is retained regardless of future hits.
    if (score > 0) {
      score--;
    }
    updateScoreboard();
  }

  /** Check for collisions between the player and all fishes/obstacles. */
  function checkCollisions() {
    const pW = images.skier.width * PLAYER_SCALE;
    const pH = images.skier.height * PLAYER_SCALE;
    const pLeft   = player.x - pW / 2;
    const pRight  = player.x + pW / 2;
    const pTop    = player.y - pH / 2;
    const pBottom = player.y + pH / 2;
    // Fish collisions
    for (let i = fishes.length - 1; i >= 0; i--) {
      const f = fishes[i];
      const fLeft   = f.x - f.w / 2;
      const fRight  = f.x + f.w / 2;
      const fTop    = f.y - f.h / 2;
      const fBottom = f.y + f.h / 2;
      if (pRight > fLeft && pLeft < fRight && pBottom > fTop && pTop < fBottom) {
        fishes.splice(i, 1);
        handleFishCatch(f);
      }
    }
    // Obstacle collisions
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      const oLeft   = o.x;
      const oRight  = o.x + o.w;
      const oTop    = o.y;
      const oBottom = o.y + o.h;
      if (pRight > oLeft && pLeft < oRight && pBottom > oTop && pTop < oBottom) {
        handleObstacleHit();
      }
    }
  }

  /** Update positions of all dynamic entities and handle spawning. */
  function updateState() {
    // Move player horizontally
    player.x += player.dx;
    const halfW = images.skier.width * PLAYER_SCALE / 2;
    if (player.x < halfW) player.x = halfW;
    if (player.x > width - halfW) player.x = width - halfW;
    // Scroll entities downward
    const scroll = currentScrollSpeed();
    for (let i = fishes.length - 1; i >= 0; i--) {
      const f = fishes[i];
      f.y += scroll;
      if (f.y - f.h / 2 > height) {
        fishes.splice(i, 1);
      }
    }
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.y += scroll;
      if (o.y - o.h > height) {
        obstacles.splice(i, 1);
      }
    }
    // Spawn new entities probabilistically
    if (Math.random() < currentFishSpawnChance()) spawnFish();
    if (Math.random() < currentObstacleSpawnChance()) spawnObstacle();
    // Check collisions
    checkCollisions();
    // Decrement flash overlay counter
    if (flashFrames > 0) flashFrames--;
  }

  /** Draw the current game state to the canvas. */
  function drawScene() {
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    // Draw fishes with slight transparency to help blend with the
    // underlying background.  Save and restore around each draw so
    // transparency does not accumulate.
    for (const f of fishes) {
      ctx.save();
      // Slight transparency helps blend fish artwork with the
      // mountain background so there aren't harsh rectangles around
      // each sprite.
      ctx.globalAlpha = 0.8;
      ctx.drawImage(f.img, f.x - f.w / 2, f.y - f.h / 2, f.w, f.h);
      ctx.restore();
    }
    // Draw obstacles with slight transparency
    for (const o of obstacles) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.drawImage(o.img, o.x, o.y, o.w, o.h);
      ctx.restore();
    }
    // Draw player with slight transparency
    const pW = images.skier.width * PLAYER_SCALE;
    const pH = images.skier.height * PLAYER_SCALE;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.drawImage(images.skier, player.x - pW / 2, player.y - pH / 2, pW, pH);
    ctx.restore();
    // Flash overlay if recently hit
    if (flashFrames > 0) {
      ctx.fillStyle = `rgba(255, 0, 0, ${0.3 * (flashFrames / 15)})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  /** Pause the game and show the overlay with a message. */
  /** Pause the game and show the overlay with a message and an image.
   *  The second parameter selects which loaded image to show (e.g.,
   *  'baseball' for fish catches or 'lab' for level up). */
  function pauseGame(message, imageKey = 'baseball') {
    if (gamePaused) return;
    gamePaused = true;
    // Populate overlay contents
    const overlay = document.getElementById('pauseOverlay');
    if (overlay) {
      const msgEl = overlay.querySelector('.pause-message');
      const imgEl = overlay.querySelector('.pause-image');
      msgEl.textContent = message;
      // Default to baseball image if requested key is missing
      const img = images[imageKey] || images.baseball;
      imgEl.src = img.src;
      overlay.style.display = 'flex';
      // Hide scoreboard while paused
      const scoreboard = document.getElementById('scoreboard');
      if (scoreboard) scoreboard.style.visibility = 'hidden';
    }
  }

  /** Resume the game by hiding the overlay. */
  function resumeGame() {
    if (!gamePaused) return;
    const overlay = document.getElementById('pauseOverlay');
    if (overlay) {
      overlay.style.display = 'none';
      // Show scoreboard again
      const scoreboard = document.getElementById('scoreboard');
      if (scoreboard) scoreboard.style.visibility = 'visible';
    }
    gamePaused = false;
    // If a level‑up message is pending, immediately show it now.
    if (pendingLevelUpMessage) {
      const msg = pendingLevelUpMessage;
      pendingLevelUpMessage = null;
      // Use lab image for level‑up overlay
      pauseGame(msg, 'lab');
    }
  }

  /** Main animation loop.  Updates state and draws if not paused. */
  function gameLoop(timestamp) {
    if (!running) return;
    if (!gamePaused) {
      updateState();
      drawScene();
    }
    requestAnimationFrame(gameLoop);
  }

  /** Initialise the game once the document has loaded. */
  function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    width = canvas.width;
    height = canvas.height;
    // Place player near bottom of canvas
    player.x = width / 2;
    player.y = height * 0.8;
    player.dx = 0;
    updateScoreboard();
    // Load assets then start game
    loadImages().then(() => {
      // Setup keyboard controls
      window.addEventListener('keydown', evt => {
        switch (evt.key) {
          case 'ArrowLeft':
          case 'a':
          case 'A':
            player.dx = -PLAYER_SPEED;
            break;
          case 'ArrowRight':
          case 'd':
          case 'D':
            player.dx = PLAYER_SPEED;
            break;
          case ' ':
            // Space toggles pause overlay if currently showing
            if (gamePaused) {
              resumeGame();
            }
            break;
        }
      });
      window.addEventListener('keyup', evt => {
        switch (evt.key) {
          case 'ArrowLeft':
          case 'ArrowRight':
          case 'a':
          case 'A':
          case 'd':
          case 'D':
            player.dx = 0;
            break;
        }
      });
      // Kick off the game loop
      requestAnimationFrame(gameLoop);
    }).catch(err => {
      console.error(err);
    });
  }

  // Start initialisation when DOM is ready
  window.addEventListener('DOMContentLoaded', init);
})();