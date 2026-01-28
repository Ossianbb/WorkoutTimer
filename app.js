// ------------------------
// Helpers
// ------------------------
function clampInt(value, min, fallback) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, n);
}

function formatTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ------------------------
// Sound (Web Audio) - must be started after a user gesture
// ------------------------
let audioCtx = null;

function ensureAudio() {
  if (audioCtx) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return; // very old browsers
  audioCtx = new AudioContext();
}

// Tiny beep helper (no external files)
function beep(freq, ms, type = "sine", gainValue = 0.03) {
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = gainValue;

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  osc.start(now);
  osc.stop(now + ms / 1000);
}

// 15s cue: only during WORK
function cue15() {
  // a slightly “higher” beep
  beep(880, 120, "sine", 0.04);
}

// 5s cue: during WORK + REST
function cue5() {
  // a lower “more urgent” beep
  beep(660, 140, "square", 0.03);
}

// ------------------------
// Exercise list editor (simple UX)
// Each row: name + optional seconds override + remove button
// ------------------------
function createExerciseRow(container, { name = "", seconds = "" } = {}) {
  const row = document.createElement("div");
  row.className = "exerciseRow";

  const nameLabel = document.createElement("label");
  nameLabel.innerHTML = `Exercise name
    <input class="exerciseName" type="text" placeholder="e.g. Plank" value="${escapeHtmlAttr(name)}" />
  `;

  const secondsLabel = document.createElement("label");
  secondsLabel.innerHTML = `Seconds (optional)
    <input class="exerciseSeconds" type="number" min="1" placeholder="use global" value="${escapeHtmlAttr(String(seconds ?? ""))}" />
  `;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "danger iconBtn";
  removeBtn.textContent = "×";
  removeBtn.title = "Remove";

  removeBtn.addEventListener("click", () => {
    row.remove();
  });

  row.appendChild(nameLabel);
  row.appendChild(secondsLabel);
  row.appendChild(removeBtn);

  container.appendChild(row);
}

function getExercisesFromList(container) {
  const rows = Array.from(container.querySelectorAll(".exerciseRow"));
  const out = [];
  for (const row of rows) {
    const name = row.querySelector(".exerciseName")?.value?.trim() ?? "";
    const secondsRaw = row.querySelector(".exerciseSeconds")?.value ?? "";
    if (!name) continue;

    let secondsOverride = null;
    if (String(secondsRaw).trim() !== "") {
      const n = Number.parseInt(secondsRaw, 10);
      if (!Number.isNaN(n) && n > 0) secondsOverride = n;
    }

    out.push({ name, secondsOverride });
  }
  return out;
}

// Avoid breaking HTML when we inject values
function escapeHtmlAttr(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ------------------------
// Build steps
// step = { type, label, durationSeconds, circuitId }
// ------------------------
function buildStepsForCircuit(circuitId, workout, exercises, repeats) {
  const steps = [];

  for (let rep = 1; rep <= repeats; rep++) {
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];

      const duration =
        ex.secondsOverride != null ? ex.secondsOverride : workout.workSeconds;

      steps.push({
        type: "work",
        label: ex.name,
        durationSeconds: duration,
        circuitId,
      });

      const isLastExercise = i === exercises.length - 1;
      if (!isLastExercise && workout.restBetweenExercisesSeconds > 0) {
        steps.push({
          type: "rest",
          label: "Rest",
          durationSeconds: workout.restBetweenExercisesSeconds,
          circuitId,
        });
      }
    }

    const isLastRepeat = rep === repeats;
    if (!isLastRepeat && workout.restBetweenCircuitsSeconds > 0) {
      steps.push({
        type: "circuit_rest",
        label: "Circuit rest",
        durationSeconds: workout.restBetweenCircuitsSeconds,
        circuitId,
      });
    }
  }

  return steps;
}

function buildSteps(workout) {
  const steps = [];

  // Circuit A
  steps.push(
    ...buildStepsForCircuit(
      "A",
      workout,
      workout.circuitA.exercises,
      workout.circuitA.repeats
    )
  );

  // Circuit B optional
  if (workout.circuitB.enabled) {
    // Transition rest (separate input)
    if (workout.transitionRestSeconds > 0) {
      steps.push({
        type: "transition_rest",
        label: "Transition rest",
        durationSeconds: workout.transitionRestSeconds,
        circuitId: "B",
      });
    }

    steps.push(
      ...buildStepsForCircuit(
        "B",
        workout,
        workout.circuitB.exercises,
        workout.circuitB.repeats
      )
    );
  }

  return steps;
}

// ------------------------
// DOM
// ------------------------
const setupView = document.getElementById("setupView");
const runView = document.getElementById("runView");

// Presets
const presetSelect = document.getElementById("presetSelect");
const presetNameInput = document.getElementById("presetNameInput");
const savePresetBtn = document.getElementById("savePresetBtn");
const loadPresetBtn = document.getElementById("loadPresetBtn");
const deletePresetBtn = document.getElementById("deletePresetBtn");

// Global inputs
const workSecondsInput = document.getElementById("workSeconds");
const restBetweenExercisesInput = document.getElementById("restBetweenExercisesSeconds");
const restBetweenCircuitsInput = document.getElementById("restBetweenCircuitsSeconds");
const circuitRepeatsInput = document.getElementById("circuitRepeats");

// Exercise lists
const exerciseListA = document.getElementById("exerciseListA");
const addExerciseABtn = document.getElementById("addExerciseABtn");

const toggleCircuitBBtn = document.getElementById("toggleCircuitBBtn");
const circuitBSection = document.getElementById("circuitBSection");
const circuitBRepeatsInput = document.getElementById("circuitBRepeats");
const transitionRestSecondsInput = document.getElementById("transitionRestSeconds");
const exerciseListB = document.getElementById("exerciseListB");
const addExerciseBBtn = document.getElementById("addExerciseBBtn");

// Setup buttons
const startBtn = document.getElementById("startBtn");
const loadExampleBtn = document.getElementById("loadExampleBtn");

// Run screen labels
const timeLabel = document.getElementById("timeLabel");
const phaseLabel = document.getElementById("phaseLabel");
const currentLabel = document.getElementById("currentLabel");
const nextLabel = document.getElementById("nextLabel");
const progressLabel = document.getElementById("progressLabel");

// Run controls
const runStartBtn = document.getElementById("runStartBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const skipBtn = document.getElementById("skipBtn");
const resetBtn = document.getElementById("resetBtn");
const backToSetupBtn = document.getElementById("backToSetupBtn");

// ------------------------
// App state
// ------------------------
let steps = [];
let workout = null;
let currentStepIndex = 0;
let secondsRemaining = 0;
let intervalId = null;
let isRunning = false;
let hasStarted = false;
let isFinished = false;

// ------------------------
// Presets (LocalStorage)
// ------------------------
const PRESETS_KEY = "workoutTimerPresetsV1";

function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function savePresets(presets) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

function refreshPresetSelect() {
  const presets = loadPresets();
  const current = presetSelect.value;

  presetSelect.innerHTML = `<option value="">— None —</option>`;
  for (const p of presets) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    presetSelect.appendChild(opt);
  }

  // Try to preserve selection
  if (current) presetSelect.value = current;
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function applyWorkoutToUI(w) {
  workSecondsInput.value = w.workSeconds ?? 45;
  restBetweenExercisesInput.value = w.restBetweenExercisesSeconds ?? 15;
  restBetweenCircuitsInput.value = w.restBetweenCircuitsSeconds ?? 60;
  circuitRepeatsInput.value = w.circuitA?.repeats ?? 2;

  // Circuit A exercises
  exerciseListA.innerHTML = "";
  const a = w.circuitA?.exercises ?? [];
  for (const ex of a) createExerciseRow(exerciseListA, { name: ex.name, seconds: ex.secondsOverride ?? "" });
  if (exerciseListA.querySelectorAll(".exerciseRow").length === 0) {
    createExerciseRow(exerciseListA, { name: "", seconds: "" });
  }

  // Circuit B
  setCircuitBEnabled(Boolean(w.circuitB?.enabled));
  circuitBRepeatsInput.value = w.circuitB?.repeats ?? 2;
  transitionRestSecondsInput.value = w.transitionRestSeconds ?? 60;

  exerciseListB.innerHTML = "";
  const b = w.circuitB?.exercises ?? [];
  for (const ex of b) createExerciseRow(exerciseListB, { name: ex.name, seconds: ex.secondsOverride ?? "" });
  if (exerciseListB.querySelectorAll(".exerciseRow").length === 0) {
    createExerciseRow(exerciseListB, { name: "", seconds: "" });
  }
}

// ------------------------
// UI view helpers
// ------------------------
function showSetup() {
  setupView.classList.remove("hidden");
  runView.classList.add("hidden");
}

function showRun() {
  setupView.classList.add("hidden");
  runView.classList.remove("hidden");
}

function setCircuitBEnabled(enabled) {
  toggleCircuitBBtn.setAttribute("aria-pressed", String(enabled));
  toggleCircuitBBtn.classList.toggle("active", enabled);
  toggleCircuitBBtn.textContent = enabled ? "Remove Circuit B" : "+ Add Circuit B";
  circuitBSection.classList.toggle("hidden", !enabled);
}

function updateRunControls() {
  runStartBtn.classList.toggle("hidden", hasStarted || steps.length === 0 || isFinished);
  pauseBtn.classList.toggle("hidden", !isRunning || steps.length === 0 || isFinished);

  const canResume = hasStarted && !isRunning && !isFinished && steps.length > 0;
  resumeBtn.classList.toggle("hidden", !canResume);
}

// ------------------------
// Workout read from UI
// ------------------------
function getWorkoutFromInputs() {
  const circuitAExercises = getExercisesFromList(exerciseListA);

  const circuitBEnabled = toggleCircuitBBtn.getAttribute("aria-pressed") === "true";
  const circuitBExercises = getExercisesFromList(exerciseListB);

  return {
    name: "My Workout",
    workSeconds: clampInt(workSecondsInput.value, 1, 45),
    restBetweenExercisesSeconds: clampInt(restBetweenExercisesInput.value, 0, 15),
    restBetweenCircuitsSeconds: clampInt(restBetweenCircuitsInput.value, 0, 60),
    transitionRestSeconds: clampInt(transitionRestSecondsInput?.value ?? 60, 0, 60),

    circuitA: {
      repeats: clampInt(circuitRepeatsInput.value, 1, 2),
      exercises: circuitAExercises,
    },

    circuitB: {
      enabled: circuitBEnabled,
      repeats: clampInt(circuitBRepeatsInput.value, 1, 2),
      exercises: circuitBExercises,
    },
  };
}

// ------------------------
// Progress helpers
// ------------------------
function getNextWorkLabel(fromIndexExclusive) {
  for (let i = fromIndexExclusive + 1; i < steps.length; i++) {
    if (steps[i].type === "work") return steps[i].label;
  }
  return null;
}

function getProgressForStep(stepIndex) {
  if (!workout) return null;
  if (!steps[stepIndex]) return null;

  const circuitId = steps[stepIndex].circuitId || "A";
  const circuit = circuitId === "B" ? workout.circuitB : workout.circuitA;
  const exercisesPerRound = circuit.exercises.length;
  const totalRounds = circuit.repeats;
  if (exercisesPerRound <= 0) return null;

  let workCountSoFar = 0;
  for (let i = 0; i <= stepIndex; i++) {
    if (steps[i].circuitId === circuitId && steps[i].type === "work") workCountSoFar += 1;
  }

  if (workCountSoFar === 0) {
    return { circuitId, round: 1, exercise: 1, exercisesPerRound, totalRounds };
  }

  const round = Math.ceil(workCountSoFar / exercisesPerRound);
  const exercise = ((workCountSoFar - 1) % exercisesPerRound) + 1;
  return { circuitId, round, exercise, exercisesPerRound, totalRounds };
}

// ------------------------
// Timer engine
// ------------------------
function stopTimer() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  isRunning = false;
  updateRunControls();
}

function startTimer() {
  if (isRunning) return;
  if (steps.length === 0) return;
  if (isFinished) return;

  // Audio needs a user gesture to start
  ensureAudio();

  isRunning = true;
  hasStarted = true;
  updateRunControls();

  intervalId = setInterval(() => {
    secondsRemaining -= 1;

    // Sound cues:
    // - 15s cue only for WORK
    // - 5s cue for both WORK and REST (including transition/circuit rest)
    const step = steps[currentStepIndex];
    if (step) {
      if (step.type === "work" && secondsRemaining === 15) cue15();
      if (secondsRemaining === 5) cue5();
    }

    if (secondsRemaining <= 0) {
      goToNextStep(true);
    } else {
      render();
    }
  }, 1000);
}

function setStep(index) {
  currentStepIndex = index;
  const step = steps[currentStepIndex];
  secondsRemaining = step.durationSeconds;
  render();
}

function goToNextStep(autoContinue) {
  stopTimer();

  const nextIndex = currentStepIndex + 1;
  if (nextIndex >= steps.length) {
    isFinished = true;
    secondsRemaining = 0;
    render();
    updateRunControls();
    return;
  }

  isFinished = false;
  setStep(nextIndex);

  if (autoContinue) startTimer();
  else updateRunControls();
}

function skipStep() {
  if (steps.length === 0) return;
  goToNextStep(isRunning);
}

function resetWorkout() {
  stopTimer();
  if (steps.length > 0) setStep(0);
  hasStarted = false;
  isFinished = false;
  updateRunControls();
}

// ------------------------
// Render (Run screen UX)
// ------------------------
function render() {
  if (steps.length === 0) return;

  const step = steps[currentStepIndex];

  if (isFinished) {
    // Clear run state classes
    runView.classList.remove("runView-work", "runView-rest", "runView-warning", "runView-urgent");

    phaseLabel.textContent = "DONE";
    timeLabel.textContent = "00:00";
    currentLabel.textContent = "Workout complete";
    nextLabel.textContent = "";
    if (workout) {
      const circuits = workout.circuitB.enabled ? "2 circuits" : "1 circuit";
      progressLabel.textContent = `Finished (${circuits})`;
    } else {
      progressLabel.textContent = "Finished";
    }
    return;
  }

  const isWork = step.type === "work";
  const isRest =
    step.type === "rest" ||
    step.type === "circuit_rest" ||
    step.type === "transition_rest";

  // Phase text
  phaseLabel.textContent = isWork ? "WORK" : "REST";

  // Labels
  timeLabel.textContent = formatTime(secondsRemaining);

  if (isWork) {
    currentLabel.textContent = step.label;
  } else if (step.type === "transition_rest") {
    currentLabel.textContent = "Transition rest";
  } else if (step.type === "circuit_rest") {
    currentLabel.textContent = "Circuit rest";
  } else {
    currentLabel.textContent = "Rest";
  }

  const next = getNextWorkLabel(currentStepIndex);
  nextLabel.textContent = next ? next : "—";

  // Progress
  const info = getProgressForStep(currentStepIndex);
  if (info) {
    progressLabel.textContent = `Circuit ${info.circuitId} • Round ${info.round} / ${info.totalRounds} • Exercise ${info.exercise} / ${info.exercisesPerRound}`;
  } else {
    progressLabel.textContent = "";
  }

  // Colour states:
  // - WORK vs REST
  // - warning when <=15s left on WORK
  // - urgent when <=5s left on any step
  runView.classList.toggle("runView-work", isWork);
  runView.classList.toggle("runView-rest", isRest);

  const warning = isWork && secondsRemaining <= 15;
  const urgent = secondsRemaining <= 5;

  runView.classList.toggle("runView-warning", warning && !urgent);
  runView.classList.toggle("runView-urgent", urgent);

  updateRunControls();
}

// ------------------------
// Events
// ------------------------

// Add exercise rows
addExerciseABtn.addEventListener("click", () => createExerciseRow(exerciseListA, { name: "", seconds: "" }));
addExerciseBBtn.addEventListener("click", () => createExerciseRow(exerciseListB, { name: "", seconds: "" }));

// Toggle Circuit B
toggleCircuitBBtn.addEventListener("click", () => {
  const isOn = toggleCircuitBBtn.getAttribute("aria-pressed") === "true";
  setCircuitBEnabled(!isOn);
});

// Go to run screen (build steps but do not start)
startBtn.addEventListener("click", () => {
  const nextWorkout = getWorkoutFromInputs();

  if (nextWorkout.circuitA.exercises.length === 0) {
    alert("Please add at least one Circuit A exercise.");
    return;
  }
  if (nextWorkout.circuitB.enabled && nextWorkout.circuitB.exercises.length === 0) {
    alert("Circuit B is enabled, but it has no exercises.");
    return;
  }

  workout = nextWorkout;
  steps = buildSteps(workout);

  hasStarted = false;
  isFinished = false;

  showRun();
  setStep(0);
  stopTimer(); // ensures buttons reflect "ready to start"
  render();
});

// Run controls
runStartBtn.addEventListener("click", () => startTimer());
pauseBtn.addEventListener("click", () => stopTimer());
resumeBtn.addEventListener("click", () => startTimer());
skipBtn.addEventListener("click", () => skipStep());
resetBtn.addEventListener("click", () => resetWorkout());
backToSetupBtn.addEventListener("click", () => {
  stopTimer();
  showSetup();
});

// Load example
loadExampleBtn.addEventListener("click", () => {
  workSecondsInput.value = 45;
  restBetweenExercisesInput.value = 15;
  restBetweenCircuitsInput.value = 60;
  circuitRepeatsInput.value = 2;

  // Circuit A
  exerciseListA.innerHTML = "";
  createExerciseRow(exerciseListA, { name: "Leg raises", seconds: "" });
  createExerciseRow(exerciseListA, { name: "Side plank (L)", seconds: "" });
  createExerciseRow(exerciseListA, { name: "Side plank (R)", seconds: "" });
  createExerciseRow(exerciseListA, { name: "Flutter kicks", seconds: "" });
  createExerciseRow(exerciseListA, { name: "Plank", seconds: 60 }); // example override

  // Circuit B off by default
  setCircuitBEnabled(false);
  circuitBRepeatsInput.value = 2;
  transitionRestSecondsInput.value = 60;

  exerciseListB.innerHTML = "";
  createExerciseRow(exerciseListB, { name: "Push-ups", seconds: "" });
  createExerciseRow(exerciseListB, { name: "Squats", seconds: "" });
  createExerciseRow(exerciseListB, { name: "Mountain climbers", seconds: "" });
  createExerciseRow(exerciseListB, { name: "Sit-ups", seconds: "" });
});

// Presets: Save
savePresetBtn.addEventListener("click", () => {
  const name = presetNameInput.value.trim();
  if (!name) {
    alert("Please enter a preset name (e.g. Core set 1).");
    return;
  }

  const w = getWorkoutFromInputs();

  // Basic validation
  if (w.circuitA.exercises.length === 0) {
    alert("Please add at least one Circuit A exercise before saving.");
    return;
  }

  const presets = loadPresets();
  presets.push({ id: makeId(), name, workout: w });
  savePresets(presets);

  presetNameInput.value = "";
  refreshPresetSelect();
});

// Presets: Load
loadPresetBtn.addEventListener("click", () => {
  const id = presetSelect.value;
  if (!id) return;

  const presets = loadPresets();
  const found = presets.find((p) => p.id === id);
  if (!found) return;

  applyWorkoutToUI(found.workout);
});

// Presets: Delete
deletePresetBtn.addEventListener("click", () => {
  const id = presetSelect.value;
  if (!id) return;

  const presets = loadPresets();
  const filtered = presets.filter((p) => p.id !== id);
  savePresets(filtered);
  refreshPresetSelect();
});

// ------------------------
// Init
// ------------------------
function init() {
  // Start with one blank row in A so UX is obvious
  if (exerciseListA.querySelectorAll(".exerciseRow").length === 0) {
    createExerciseRow(exerciseListA, { name: "Leg raises", seconds: "" });
    createExerciseRow(exerciseListA, { name: "Side plank (L)", seconds: "" });
    createExerciseRow(exerciseListA, { name: "Side plank (R)", seconds: "" });
    createExerciseRow(exerciseListA, { name: "Flutter kicks", seconds: "" });
    createExerciseRow(exerciseListA, { name: "Plank", seconds: "" });
  }

  if (exerciseListB.querySelectorAll(".exerciseRow").length === 0) {
    createExerciseRow(exerciseListB, { name: "Push-ups", seconds: "" });
    createExerciseRow(exerciseListB, { name: "Squats", seconds: "" });
  }

  setCircuitBEnabled(false);
  refreshPresetSelect();
  showSetup();
}

init();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // If it fails, the app still works — you just won't get offline caching.
    });
  });
}