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
// Sound + Speech
// ------------------------
let audioCtx = null;

function ensureAudio() {
  if (audioCtx) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  audioCtx = new AudioContext();
}

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

// Halfway cue (exercise only)
function cueHalf() {
  beep(880, 140, "sine", 0.04);
}

// Final countdown cue (3..2..1) for any step
function cueFinalTick() {
  beep(660, 90, "square", 0.03);
}

function speak(text) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

// ------------------------
// Exercise list editor (compact UX)
// ------------------------
function createExerciseRow(container, { name = "", seconds = "" } = {}) {
  const row = document.createElement("div");
  row.className = "exerciseRow";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "exerciseName";
  nameInput.placeholder = "e.g. Plank";
  nameInput.value = name;
  nameInput.setAttribute("aria-label", "Exercise name");
  nameInput.addEventListener("input", () => updateTotalDurationLabel?.());

  const secondsInput = document.createElement("input");
  secondsInput.type = "number";
  secondsInput.min = "1";
  secondsInput.className = "exerciseSeconds";
  secondsInput.placeholder = "—";
  secondsInput.value = String(seconds ?? "");
  secondsInput.setAttribute("aria-label", "Seconds override (optional)");
  secondsInput.addEventListener("input", () => updateTotalDurationLabel?.());

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "danger iconBtn";
  removeBtn.textContent = "×";
  removeBtn.title = "Remove";
  removeBtn.addEventListener("click", () => row.remove());
  removeBtn.addEventListener("click", () => updateTotalDurationLabel?.());

  row.appendChild(nameInput);
  row.appendChild(secondsInput);
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

// ------------------------
// Build steps
// ------------------------
function buildStepsForCircuit(circuitId, workout, exercises, repeats) {
  const steps = [];

  for (let rep = 1; rep <= repeats; rep++) {
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const duration = ex.secondsOverride != null ? ex.secondsOverride : workout.workSeconds;

      steps.push({
        type: "exercise",
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
  steps.push(...buildStepsForCircuit("A", workout, workout.circuitA.exercises, workout.circuitA.repeats));

  if (workout.circuitB.enabled) {
    if (workout.transitionRestSeconds > 0) {
      steps.push({
        type: "transition_rest",
        label: "Transition rest",
        durationSeconds: workout.transitionRestSeconds,
        circuitId: "B",
      });
    }
    steps.push(...buildStepsForCircuit("B", workout, workout.circuitB.exercises, workout.circuitB.repeats));
  }

  return steps;
}

function getTotalDurationSecondsForWorkout(w) {
  const tempSteps = buildSteps(w);
  let total = 0;
  for (const step of tempSteps) total += step.durationSeconds;
  return total;
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

// Circuit inputs
const circuitRepeatsInput = document.getElementById("circuitRepeats");

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

// Run labels
const timeLabel = document.getElementById("timeLabel");
const phaseLabel = document.getElementById("phaseLabel");
const countdownLabel = document.getElementById("countdownLabel");
const currentLabel = document.getElementById("currentLabel");
const nextLabel = document.getElementById("nextLabel");
const progressLabel = document.getElementById("progressLabel");
const totalDurationLabel = document.getElementById("totalDurationLabel");
const overallProgressFill = document.getElementById("overallProgressFill");

// Run controls
const runStartBtn = document.getElementById("runStartBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const skipBtn = document.getElementById("skipBtn");
const resetBtn = document.getElementById("resetBtn");
const backToSetupBtn = document.getElementById("backToSetupBtn");

// ------------------------
// State
// ------------------------
let steps = [];
let workout = null;
let currentStepIndex = 0;
let secondsRemaining = 0;
let intervalId = null;
let isRunning = false;
let hasStarted = false;
let isFinished = false;

// Track one-off cues per step
let lastHalfCueStepIndex = null;
let lastFinalCueKey = null; // `${stepIndex}:${secondsRemaining}`
let lastSpokenRestStepIndex = null;

// ------------------------
// Presets (LocalStorage)
// ------------------------
const PRESETS_KEY = "workoutTimerPresetsV1";

function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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
  if (current) presetSelect.value = current;
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function setCircuitBEnabled(enabled) {
  toggleCircuitBBtn.setAttribute("aria-pressed", String(enabled));
  toggleCircuitBBtn.classList.toggle("active", enabled);
  toggleCircuitBBtn.textContent = enabled ? "Remove Circuit B" : "+ Add Circuit B";
  circuitBSection.classList.toggle("hidden", !enabled);
}

function applyWorkoutToUI(w) {
  workSecondsInput.value = w.workSeconds ?? 45;
  restBetweenExercisesInput.value = w.restBetweenExercisesSeconds ?? 15;
  restBetweenCircuitsInput.value = w.restBetweenCircuitsSeconds ?? 60;

  circuitRepeatsInput.value = w.circuitA?.repeats ?? 2;

  exerciseListA.innerHTML = "";
  for (const ex of (w.circuitA?.exercises ?? [])) {
    createExerciseRow(exerciseListA, { name: ex.name, seconds: ex.secondsOverride ?? "" });
  }
  if (exerciseListA.querySelectorAll(".exerciseRow").length === 0) createExerciseRow(exerciseListA);

  setCircuitBEnabled(Boolean(w.circuitB?.enabled));
  circuitBRepeatsInput.value = w.circuitB?.repeats ?? 2;
  transitionRestSecondsInput.value = w.transitionRestSeconds ?? 60;

  exerciseListB.innerHTML = "";
  for (const ex of (w.circuitB?.exercises ?? [])) {
    createExerciseRow(exerciseListB, { name: ex.name, seconds: ex.secondsOverride ?? "" });
  }
  if (exerciseListB.querySelectorAll(".exerciseRow").length === 0) createExerciseRow(exerciseListB);
}

// ------------------------
// Views
// ------------------------
function showSetup() {
  setupView.classList.remove("hidden");
  runView.classList.add("hidden");
}

function showRun() {
  setupView.classList.add("hidden");
  runView.classList.remove("hidden");
}

function updateRunControls() {
  runStartBtn.classList.toggle("hidden", hasStarted || steps.length === 0 || isFinished);
  pauseBtn.classList.toggle("hidden", !isRunning || steps.length === 0 || isFinished);
  const canResume = hasStarted && !isRunning && !isFinished && steps.length > 0;
  resumeBtn.classList.toggle("hidden", !canResume);
}

// ------------------------
// Build workout from UI
// ------------------------
function getWorkoutFromInputs() {
  const circuitAExercises = getExercisesFromList(exerciseListA);
  const circuitBEnabled = toggleCircuitBBtn.getAttribute("aria-pressed") === "true";
  const circuitBExercises = getExercisesFromList(exerciseListB);

  return {
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
// Progress + labels
// ------------------------
function getNextExerciseLabel(fromIndexExclusive) {
  for (let i = fromIndexExclusive + 1; i < steps.length; i++) {
    if (steps[i].type === "exercise") return steps[i].label;
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

  let exerciseCount = 0;
  for (let i = 0; i <= stepIndex; i++) {
    if (steps[i].circuitId === circuitId && steps[i].type === "exercise") exerciseCount += 1;
  }

  if (exerciseCount === 0) {
    return { circuitId, round: 1, exercise: 1, exercisesPerRound, totalRounds };
  }

  const round = Math.ceil(exerciseCount / exercisesPerRound);
  const exercise = ((exerciseCount - 1) % exercisesPerRound) + 1;
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
  if (isRunning || steps.length === 0 || isFinished) return;

  ensureAudio();

  isRunning = true;
  hasStarted = true;
  updateRunControls();

  intervalId = setInterval(() => {
    secondsRemaining -= 1;

    const step = steps[currentStepIndex];

    // Cues:
    // - Halfway cue (beep + colour) for EXERCISE only, once per step
    // - Final countdown 3..2..1 for ANY step (exercise or rest), each second once
    if (step) {
      if (step.type === "exercise") {
        const halfPoint = Math.floor(step.durationSeconds / 2);
        if (secondsRemaining === halfPoint && lastHalfCueStepIndex !== currentStepIndex) {
          lastHalfCueStepIndex = currentStepIndex;
          cueHalf();
        }
      }

      if (secondsRemaining <= 3 && secondsRemaining >= 1) {
        const key = `${currentStepIndex}:${secondsRemaining}`;
        if (lastFinalCueKey !== key) {
          lastFinalCueKey = key;
          cueFinalTick();
        }
      }
    }

    if (secondsRemaining <= 0) {
      goToNextStep(true);
    } else {
      render();
    }
  }, 1000);
}

function setStep(index, previousStep) {
  currentStepIndex = index;
  const step = steps[currentStepIndex];
  secondsRemaining = step.durationSeconds;

  // Speak “Rest” when a rest step begins (right as it switches)
  const isNowRest =
    step.type === "rest" || step.type === "circuit_rest" || step.type === "transition_rest";
  const wasExercise = previousStep?.type === "exercise";

  if (isNowRest && wasExercise && lastSpokenRestStepIndex !== currentStepIndex) {
    lastSpokenRestStepIndex = currentStepIndex;
    speak("Rest");
  }

  render();
}

function goToNextStep(autoContinue) {
  const prev = steps[currentStepIndex];
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
  setStep(nextIndex, prev);

  if (autoContinue) startTimer();
  else updateRunControls();
}

function skipStep() {
  if (steps.length === 0) return;
  goToNextStep(isRunning);
}

function resetWorkout() {
  stopTimer();
  if (steps.length > 0) {
    lastHalfCueStepIndex = null;
    lastFinalCueKey = null;
    lastSpokenRestStepIndex = null;
    setStep(0, null);
  }
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
  const totalSeconds = steps.reduce((acc, s) => acc + s.durationSeconds, 0);
  const remainingSeconds =
    steps.slice(currentStepIndex + 1).reduce((acc, s) => acc + s.durationSeconds, 0) +
    secondsRemaining;
  const completedSeconds = Math.max(0, totalSeconds - remainingSeconds);
  const overallPct = totalSeconds > 0 ? Math.min(100, (completedSeconds / totalSeconds) * 100) : 0;
  if (overallProgressFill) overallProgressFill.style.width = `${overallPct}%`;

  if (isFinished) {
    runView.classList.remove("runView-exercise", "runView-rest", "runView-half", "runView-final");
    phaseLabel.textContent = "Done";
    countdownLabel.textContent = "";
    timeLabel.textContent = "00:00";
    currentLabel.textContent = "Workout complete";
    nextLabel.textContent = "";
    progressLabel.textContent = "Finished";
    return;
  }

  const isExercise = step.type === "exercise";
  const isRest =
    step.type === "rest" || step.type === "circuit_rest" || step.type === "transition_rest";

  // Labels
  phaseLabel.textContent = isExercise ? "Exercise" : "Rest";

  // Countdown display for last 3 seconds
  countdownLabel.textContent =
    secondsRemaining <= 3 && secondsRemaining >= 1 ? String(secondsRemaining) : "";

  // Time
  timeLabel.textContent = formatTime(secondsRemaining);

  // Current label (bigger already via CSS)
  currentLabel.textContent = isExercise
    ? step.label
    : step.type === "transition_rest"
      ? "Transition rest"
      : "Rest";

  const next = getNextExerciseLabel(currentStepIndex);
  nextLabel.textContent = next ? next : "—";

  // Progress
  const info = getProgressForStep(currentStepIndex);
  progressLabel.textContent = info
    ? `Circuit ${info.circuitId} • Round ${info.round} / ${info.totalRounds} • Exercise ${info.exercise} / ${info.exercisesPerRound}`
    : "";

  // Colour states:
  // - Exercise vs Rest
  // - Halfway state on exercise (<= half remaining, >3s)
  // - Final state for any step (<=3s)
  runView.classList.toggle("runView-exercise", isExercise);
  runView.classList.toggle("runView-rest", isRest);

  const halfPoint = isExercise ? Math.floor(step.durationSeconds / 2) : null;
  const isHalf = isExercise && secondsRemaining <= halfPoint && secondsRemaining > 3;
  const isFinal = secondsRemaining <= 3;

  runView.classList.toggle("runView-half", isHalf && !isFinal);
  runView.classList.toggle("runView-final", isFinal);

  updateRunControls();
}

// ------------------------
// Events
// ------------------------
addExerciseABtn.addEventListener("click", () => createExerciseRow(exerciseListA));
addExerciseBBtn.addEventListener("click", () => createExerciseRow(exerciseListB));

toggleCircuitBBtn.addEventListener("click", () => {
  const isOn = toggleCircuitBBtn.getAttribute("aria-pressed") === "true";
  setCircuitBEnabled(!isOn);
});

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
  lastHalfCueStepIndex = null;
  lastFinalCueKey = null;
  lastSpokenRestStepIndex = null;

  showRun();
  setStep(0, null);
  stopTimer();
  render();
});

runStartBtn.addEventListener("click", () => startTimer());
pauseBtn.addEventListener("click", () => stopTimer());
resumeBtn.addEventListener("click", () => startTimer());
skipBtn.addEventListener("click", () => skipStep());
resetBtn.addEventListener("click", () => resetWorkout());
backToSetupBtn.addEventListener("click", () => {
  stopTimer();
  showSetup();
});

loadExampleBtn.addEventListener("click", () => {
  workSecondsInput.value = 45;
  restBetweenExercisesInput.value = 15;
  restBetweenCircuitsInput.value = 60;
  circuitRepeatsInput.value = 2;

  exerciseListA.innerHTML = "";
  createExerciseRow(exerciseListA, { name: "Leg raises", seconds: "" });
  createExerciseRow(exerciseListA, { name: "Side plank (L)", seconds: "" });
  createExerciseRow(exerciseListA, { name: "Side plank (R)", seconds: "" });
  createExerciseRow(exerciseListA, { name: "Flutter kicks", seconds: "" });
  createExerciseRow(exerciseListA, { name: "Plank", seconds: "60" });

  setCircuitBEnabled(false);
  circuitBRepeatsInput.value = 2;
  transitionRestSecondsInput.value = 60;

  exerciseListB.innerHTML = "";
  createExerciseRow(exerciseListB, { name: "Push-ups", seconds: "" });
  createExerciseRow(exerciseListB, { name: "Squats", seconds: "" });
});

savePresetBtn.addEventListener("click", () => {
  const name = presetNameInput.value.trim();
  if (!name) return alert("Please enter a preset name.");

  const w = getWorkoutFromInputs();
  if (w.circuitA.exercises.length === 0) return alert("Add at least one Circuit A exercise before saving.");

  const presets = loadPresets();
  presets.push({ id: makeId(), name, workout: w });
  savePresets(presets);

  presetNameInput.value = "";
  refreshPresetSelect();
});

loadPresetBtn.addEventListener("click", () => {
  const id = presetSelect.value;
  if (!id) return;

  const presets = loadPresets();
  const found = presets.find((p) => p.id === id);
  if (!found) return;
  applyWorkoutToUI(found.workout);
});

deletePresetBtn.addEventListener("click", () => {
  const id = presetSelect.value;
  if (!id) return;

  const presets = loadPresets();
  savePresets(presets.filter((p) => p.id !== id));
  refreshPresetSelect();
});

// ------------------------
// Init
// ------------------------
function init() {
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

// ------------------------
// Setup summary (total duration)
// ------------------------
function updateTotalDurationLabel() {
  if (!totalDurationLabel) return;
  const w = getWorkoutFromInputs();
  if (w.circuitA.exercises.length === 0) {
    totalDurationLabel.textContent = "—";
    return;
  }
  if (w.circuitB.enabled && w.circuitB.exercises.length === 0) {
    totalDurationLabel.textContent = "—";
    return;
  }

  const total = getTotalDurationSecondsForWorkout(w);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  totalDurationLabel.textContent = `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

[
  workSecondsInput,
  restBetweenExercisesInput,
  restBetweenCircuitsInput,
  circuitRepeatsInput,
  transitionRestSecondsInput,
  circuitBRepeatsInput,
  presetSelect,
  presetNameInput,
].forEach((el) => el && el.addEventListener("input", updateTotalDurationLabel));

["click", "change"].forEach((evt) => {
  addExerciseABtn.addEventListener(evt, updateTotalDurationLabel);
  addExerciseBBtn.addEventListener(evt, updateTotalDurationLabel);
  toggleCircuitBBtn.addEventListener(evt, updateTotalDurationLabel);
  loadPresetBtn.addEventListener(evt, updateTotalDurationLabel);
  deletePresetBtn.addEventListener(evt, updateTotalDurationLabel);
  savePresetBtn.addEventListener(evt, updateTotalDurationLabel);
  loadExampleBtn.addEventListener(evt, updateTotalDurationLabel);
});

// Initial update
updateTotalDurationLabel();
