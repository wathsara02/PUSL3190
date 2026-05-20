type SoundKind = 'card' | 'win' | 'loss';

let audioContext: AudioContext | null = null;

function getAudioContext() {
    audioContext ??= new AudioContext();
    return audioContext;
}

function playTone(frequency: number, durationMs: number, kind: SoundKind) {
    try {
        const context = getAudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = kind === 'loss' ? 'sawtooth' : 'triangle';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + durationMs / 1000);

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + durationMs / 1000);
    } catch {
        // Browsers may block audio until user interaction; gameplay should continue silently.
    }
}

export function playCardFlip() {
    playTone(420, 90, 'card');
}

export function playWin() {
    playTone(660, 140, 'win');
    window.setTimeout(() => playTone(880, 180, 'win'), 120);
}

export function playLoss() {
    playTone(180, 240, 'loss');
}
