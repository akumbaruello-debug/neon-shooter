"use client";

import type { GameOverSummary } from "@/game/types";
import { formatTime } from "./uiUtil";

export interface GameOverScreenProps {
  summary: GameOverSummary;
  victory: boolean;
  onRetry: () => void;
  onTitle: () => void;
}

export default function GameOverScreen({ summary, victory, onRetry, onTitle }: GameOverScreenProps) {
  const isNewBest = summary.score > 0 && summary.score >= summary.highScore;
  return (
    <div className={`overlay overlay-gameover scanlines${victory ? " is-victory" : ""}`} role="dialog" aria-modal="true" aria-label={victory ? "Victory" : "Game over"}>
      <div className="panel gameover-panel">
        <h2 className={`go-title${victory ? " is-victory" : ""}`}>{victory ? "Sector Cleared" : "Run Ended"}</h2>

        <div className="go-grid">
          <div className="go-stat">
            <span className="go-stat-label">Stage</span>
            <span className="go-stat-value">{summary.stage}</span>
          </div>
          <div className="go-stat">
            <span className="go-stat-label">Level</span>
            <span className="go-stat-value">{summary.level}</span>
          </div>
          <div className="go-stat">
            <span className="go-stat-label">Kills</span>
            <span className="go-stat-value">{summary.kills.toLocaleString()}</span>
          </div>
          <div className="go-stat">
            <span className="go-stat-label">Time</span>
            <span className="go-stat-value">{formatTime(summary.time)}</span>
          </div>
          <div className="go-stat go-stat-wide">
            <span className="go-stat-label">Score</span>
            <span className="go-stat-value go-score">{summary.score.toLocaleString()}</span>
          </div>
          <div className="go-stat">
            <span className="go-stat-label">Best Stage</span>
            <span className="go-stat-value">{summary.bestStage}</span>
          </div>
          <div className="go-stat">
            <span className="go-stat-label">High Score</span>
            <span className="go-stat-value">{summary.highScore.toLocaleString()}</span>
          </div>
        </div>

        {isNewBest ? <p className="go-best">New high score!</p> : null}

        <div className="go-build">
          <div className="build-row">
            <span className="build-label">Weapon</span>
            <span className="build-value">{summary.weaponName}</span>
          </div>
          {summary.skills.length > 0 ? (
            <div className="build-skills">
              {summary.skills.map((s) => (
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
          ) : null}
        </div>

        {summary.lastHit ? <p className="go-lasthit">Last hit: {summary.lastHit}</p> : null}

        <div className="panel-buttons">
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            {victory ? "New Run" : "Retry"}
          </button>
          <button type="button" className="btn" onClick={onTitle}>
            Title
          </button>
        </div>
      </div>
    </div>
  );
}