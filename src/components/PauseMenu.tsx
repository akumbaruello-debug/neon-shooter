"use client";

export interface BuildSkill {
  name: string;
  level: number;
}

export interface PauseMenuProps {
  weaponName: string;
  skills: BuildSkill[];
  onResume: () => void;
  onSettings: () => void;
  onControls: () => void;
  onQuit: () => void;
}

export default function PauseMenu({ weaponName, skills, onResume, onSettings, onControls, onQuit }: PauseMenuProps) {
  return (
    <div className="overlay overlay-pause scanlines" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="panel pause-panel">
        <h2 className="panel-title">Paused</h2>

        <div className="pause-build">
          <div className="build-row">
            <span className="build-label">Weapon</span>
            <span className="build-value">{weaponName}</span>
          </div>
          {skills.length > 0 ? (
            <div className="build-skills">
              {skills.map((s) => (
                <div className="build-skill" key={s.name}>
                  <span className="build-skill-name">{s.name}</span>
                  <span className="build-pips" aria-label={`level ${s.level} of 5`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <i key={i} className={i < s.level ? "on" : ""} />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="build-empty">No skills yet.</p>
          )}
        </div>

        <div className="panel-buttons">
          <button type="button" className="btn btn-primary" onClick={onResume}>
            Resume
          </button>
          <button type="button" className="btn" onClick={onSettings}>
            Settings
          </button>
          <button type="button" className="btn" onClick={onControls}>
            Controls
          </button>
          <button type="button" className="btn btn-danger" onClick={onQuit}>
            Quit to Title
          </button>
        </div>

        <p className="panel-hint">Esc / P resumes</p>
      </div>
    </div>
  );
}
