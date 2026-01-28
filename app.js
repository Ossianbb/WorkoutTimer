// --- Helpers ---
// A tiny helper to safely turn user input into integers.
// - If parsing fails, we use a fallback.
// - We also enforce a minimum (e.g. seconds can't go below 0/1).
function clampInt(value, min, fallback) {
    const n = Number.parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, n);
  }
  
  // Format seconds like 65 -> "01:05"
  function formatTime(totalSeconds) {
    const s = Math.max(0, totalSeconds);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }
  
  // Turn a textarea into ["Exercise 1", "Exercise 2", ...]
  function parseExercises(text) {
    return text
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
  }
  
  // Build a flat list of steps the timer can run through.
  //
  // Spec:
  // step = { type: "work"|"rest"|"circuit_rest", label: string, durationSeconds: number }
  //
  // For each circuit repeat:
  //   for each exercise -> add work step
  //   add rest step between exercises (not after last)
  //   add circuit_rest between repeats (not after last repeat)
  function buildStepsForCircuit(circuitId, workout, exercises, repeats) {
    const steps = [];
  
    for (let rep = 1; rep <= repeats; rep++) {
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
  
        // A "work" step is an exercise.
        steps.push({
          type: "work",
          label: ex,
          durationSeconds: workout.workSeconds,
          circuitId, // extra metadata for UI ("A" or "B")
        });
  
        // Add rest between exercises (not after the last exercise).
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
  
      // Add circuit rest between repeats (not after the last repeat).
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
  
    // Circuit A (always present)
    steps.push(
      ...buildStepsForCircuit(
        "A",
        workout,
        workout.circuitA.exercises,
        workout.circuitA.repeats
      )
    );
  
    // Optional Circuit B (runs AFTER Circuit A)
    if (workout.circuitB.enabled) {
      // A rest before Circuit B starts (re-using your "rest between circuit repeats" value).
      // You can think of this as "transition rest".
      if (workout.restBetweenCircuitsSeconds > 0) {
        steps.push({
          type: "circuit_rest",
          label: "Rest (before Circuit B)",
          durationSeconds: workout.restBetweenCircuitsSeconds,
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
  
  // --- DOM ---
  const setupView = document.getElementById("setupView");
  const runView = document.getElementById("runView");
  
  const workSecondsInput = document.getElementById("workSeconds");
  const restBetweenExercisesInput = document.getElementById("restBetweenExercisesSeconds");
  const restBetweenCircuitsInput = document.getElementById("restBetweenCircuitsSeconds");
  const circuitRepeatsInput = document.getElementById("circuitRepeats");
  const exercisesTextarea = document.getElementById("exercises");
  const toggleCircuitBBtn = document.getElementById("toggleCircuitBBtn");
  const circuitBSection = document.getElementById("circuitBSection");
  const circuitBRepeatsInput = document.getElementById("circuitBRepeats");
  const exercisesBTextarea = document.getElementById("exercisesB");
  
  const startBtn = document.getElementById("startBtn");
  const loadExampleBtn = document.getElementById("loadExampleBtn");
  
  const phaseLabel = document.getElementById("phaseLabel");
  const exerciseLabel = document.getElementById("exerciseLabel");
  const timeLabel = document.getElementById("timeLabel");
  const progressLabel = document.getElementById("progressLabel");
  
  const runStartBtn = document.getElementById("runStartBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const skipBtn = document.getElementById("skipBtn");
  const resetBtn = document.getElementById("resetBtn");
  const backToSetupBtn = document.getElementById("backToSetupBtn");
  
  // --- App state ---
  // The flattened list of steps (work/rest/etc) we will run through.
  let steps = [];
  // Keep the original workout settings too, so we can show nicer progress like:
  // "Round 1 • Exercise 2 / 5" (instead of "Step 7 / 19").
  let workout = null;
  // Which step we are currently on (0-based).
  let currentStepIndex = 0;
  // How many seconds remain in the current step.
  let secondsRemaining = 0;
  // The setInterval ID when running, or null when stopped.
  let intervalId = null;
  // True while the timer is ticking.
  let isRunning = false;
  // True after the user presses Run-screen Start at least once.
  // This lets us show Start before running, and Resume after a pause.
  let hasStarted = false;
  // True once we've run past the last step.
  let isFinished = false;
  
  function getWorkoutFromInputs() {
    const circuitAExercises = parseExercises(exercisesTextarea.value);
    const circuitBEnabled = toggleCircuitBBtn.getAttribute("aria-pressed") === "true";
    const circuitBExercises = parseExercises(exercisesBTextarea.value);

    return {
      name: "My Workout",
      // Global timing settings (applies to both circuits)
      workSeconds: clampInt(workSecondsInput.value, 1, 45),
      restBetweenExercisesSeconds: clampInt(restBetweenExercisesInput.value, 0, 15),
      // We use this for:
      // - rest between repeats within a circuit
      // - transition rest between Circuit A and Circuit B
      restBetweenCircuitsSeconds: clampInt(restBetweenCircuitsInput.value, 0, 60),

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
  
  function showSetup() {
    setupView.classList.remove("hidden");
    runView.classList.add("hidden");
  }
  
  function showRun() {
    setupView.classList.add("hidden");
    runView.classList.remove("hidden");
  }
  
  // Show/hide the Run buttons depending on state.
  function updateRunControls() {
    // Start shows only before the workout has started.
    runStartBtn.classList.toggle("hidden", hasStarted || steps.length === 0 || isFinished);

    // Pause shows only while we're actively running.
    pauseBtn.classList.toggle("hidden", !isRunning || steps.length === 0 || isFinished);

    // Resume shows only when we have started, are currently stopped, and not finished.
    const canResume = hasStarted && !isRunning && !isFinished && steps.length > 0;
    resumeBtn.classList.toggle("hidden", !canResume);

    // Skip/Reset are always visible on the run screen (but become no-ops if empty).
  }

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
    isRunning = true;
    hasStarted = true;
    updateRunControls();
  
    intervalId = setInterval(() => {
      secondsRemaining -= 1;
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

  // Find the label of the next "work" step after the current index.
  // Used to show a friendly hint during rests: "Next: Push-ups".
  function getNextWorkLabel(fromIndexExclusive) {
    for (let i = fromIndexExclusive + 1; i < steps.length; i++) {
      if (steps[i].type === "work") return steps[i].label;
    }
    return null;
  }

  // Convert a step index into:
  // "Circuit A • Round X / R • Exercise Y / N"
  //
  // Important: we ONLY count "work" steps as exercises.
  function getProgressForStep(stepIndex) {
    if (!workout) return null;
    if (!steps[stepIndex]) return null;

    const circuitId = steps[stepIndex].circuitId || "A";
    const circuit = circuitId === "B" ? workout.circuitB : workout.circuitA;
    const exercisesPerRound = circuit.exercises.length;
    const totalRounds = circuit.repeats;
    if (exercisesPerRound <= 0) return null;

    // Count how many "work" steps in this circuit happened up to and including stepIndex.
    let workCountSoFar = 0;
    for (let i = 0; i <= stepIndex; i++) {
      if (steps[i].circuitId === circuitId && steps[i].type === "work") workCountSoFar += 1;
    }

    // If we're on a rest step before the first exercise, default to 1/1.
    if (workCountSoFar === 0) {
      return { circuitId, round: 1, exercise: 1, exercisesPerRound, totalRounds };
    }

    const round = Math.ceil(workCountSoFar / exercisesPerRound);
    const exercise = ((workCountSoFar - 1) % exercisesPerRound) + 1;
    return { circuitId, round, exercise, exercisesPerRound, totalRounds };
  }
  
  // Move to the next step.
  // If autoContinue is true, we immediately keep running after switching.
  function goToNextStep(autoContinue) {
    stopTimer(); // stop interval cleanly before switching
  
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= steps.length) {
      // Finished!
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
    // If we're currently running, keep running after skipping.
    // If we haven't started yet, skipping just moves the pointer.
    goToNextStep(isRunning);
  }
  
  function resetWorkout() {
    stopTimer();
    if (steps.length > 0) {
      setStep(0);
    }
    hasStarted = false;
    isFinished = false;
    updateRunControls();
  }
  
  function render() {
    if (steps.length === 0) return;
  
    const step = steps[currentStepIndex];
  
    if (isFinished) {
      phaseLabel.textContent = "Exercise:";
      phaseLabel.classList.remove("work", "rest");
      exerciseLabel.textContent = "Workout complete";
      timeLabel.textContent = "00:00";
      if (workout) {
        const circuits = workout.circuitB.enabled ? "2 circuits" : "1 circuit";
        progressLabel.textContent = `Finished (${circuits})`;
      } else {
        progressLabel.textContent = "Finished";
      }
      return;
    }

    // You asked: during the workout, the top label should say "Exercise:" (not WORK/REST).
    // We'll still color it subtly depending on whether we're exercising or resting.
    phaseLabel.textContent = step.type === "work" ? "Exercise:" : "Rest:";
    phaseLabel.classList.toggle("work", step.type === "work");
    phaseLabel.classList.toggle("rest", step.type !== "work");

    // Spec: show exercise label (when working).
    // During rests we keep this blank to reduce clutter.
    if (step.type === "work") {
      exerciseLabel.textContent = step.label;
    } else {
      const next = getNextWorkLabel(currentStepIndex);
      exerciseLabel.textContent = next ? `Next: ${next}` : "";
    }
    timeLabel.textContent = formatTime(secondsRemaining);

    // Cleaner progress: circuit/round/exercise (only counts "work" steps as exercises).
    const info = getProgressForStep(currentStepIndex);
    if (info) {
      // Example: "Circuit A • Round 1 / 2 • Exercise 2 / 5"
      progressLabel.textContent = `Circuit ${info.circuitId} • Round ${info.round} / ${info.totalRounds} • Exercise ${info.exercise} / ${info.exercisesPerRound}`;
    } else {
      progressLabel.textContent = "";
    }
    updateRunControls();
  }
  
  // --- Events ---
  startBtn.addEventListener("click", () => {
    const nextWorkout = getWorkoutFromInputs();
    if (nextWorkout.circuitA.exercises.length === 0) {
      alert("Please add at least one exercise (one per line).");
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
    stopTimer(); // ensure buttons reflect "ready to start"
    render();
  });
  
  runStartBtn.addEventListener("click", () => {
    startTimer();
  });

  pauseBtn.addEventListener("click", () => {
    stopTimer();
  });

  resumeBtn.addEventListener("click", () => {
    startTimer();
  });
  
  skipBtn.addEventListener("click", () => {
    skipStep();
  });
  
  resetBtn.addEventListener("click", () => {
    resetWorkout();
  });
  
  backToSetupBtn.addEventListener("click", () => {
    stopTimer();
    showSetup();
  });
  
  loadExampleBtn.addEventListener("click", () => {
    workSecondsInput.value = 45;
    restBetweenExercisesInput.value = 15;
    restBetweenCircuitsInput.value = 60;
    circuitRepeatsInput.value = 2;
    exercisesTextarea.value = `Leg raises
  Side plank (L)
  Side plank (R)
  Flutter kicks
  Plank`;

    toggleCircuitBBtn.setAttribute("aria-pressed", "false");
    toggleCircuitBBtn.classList.remove("active");
    toggleCircuitBBtn.textContent = "+ Add Circuit B";
    circuitBSection.classList.add("hidden");
    circuitBRepeatsInput.value = 2;
    exercisesBTextarea.value = `Push-ups
Squats
Mountain climbers
Sit-ups`;
  });

  toggleCircuitBBtn.addEventListener("click", () => {
    const isOn = toggleCircuitBBtn.getAttribute("aria-pressed") === "true";
    const next = !isOn;

    toggleCircuitBBtn.setAttribute("aria-pressed", String(next));
    toggleCircuitBBtn.classList.toggle("active", next);
    toggleCircuitBBtn.textContent = next ? "Remove Circuit B" : "+ Add Circuit B";

    circuitBSection.classList.toggle("hidden", !next);
  });
  
  // Initial view
  showSetup();