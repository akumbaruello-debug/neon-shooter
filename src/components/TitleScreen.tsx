"use client";

export interface TitleScreenProps {
  bestStage: number;
  highScore: number;
  /** 0 = no checkpoint saved. */
  checkpoint: number;
  onStart: () => void;
  onContinue: (stage: number) => void;
  onSettings: () => void;
  onControls: () => void;
}

export default function TitleScreen({
  bestStage,
  highScore,
  checkpoint,
  onStart,
  onContinue,
  onSettings,
  onControls,
}: TitleScreenProps) {
  return (
    <div className="overlay overlay-title scanlines">
      <div className="title-inner">
        <h1 className="game-title">
          <span>NEON</span>
          <span>SHOOTER</span>
        </h1>
        <p className="game-subtitle">50 stages · 12 weapons · 18 skills · 5 bosses</p>

        <div className="title-buttons">
          <button type="button" className="btn btn-primary" onClick={onStart}>
            Start Run
          </button>
          {checkpoint > 0 ? (
            <button type="button" className="btn" onClick={() => onContinue(checkpoint)}>
              Continue · Stage {checkpoint}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onSettings}>
            Settings
          </button>
          <button type="button" className="btn" onClick={onControls}>
            Controls
          </button>
        </div>

        <div className="title-stats">
          <span>
            Best Stage <b>{bestStage > 0 ? bestStage : "—"}</b>
          </span>
          <span>
            High Score <b>{highScore > 0 ? highScore.toLocaleString() : "—"}</b>
          </span>
        </div>
      </div>
    </div>
  );
}
