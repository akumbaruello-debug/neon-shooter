"use client";

import { useEffect, useState } from "react";
import type { AttackPatternId, HudState, SkillId, WeaponId } from "@/game/types";
import type { DebugApi } from "@/hooks/useGame";
import { SKILLS } from "@/game/data/skills";
import { WEAPONS } from "@/game/data/weapons";
import { PATTERN_LIST } from "@/game/data/patterns";

export interface DebugPanelProps {
  api: DebugApi | null;
  hud: HudState | null;
  onClose: () => void;
}

/** Attack-pattern + tier hooks the engine build may or may not expose yet. */
type DevApi = DebugApi & {
  setPattern(id: AttackPatternId): void;
  weaponTier(): number;
};

const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
const ROCKS_TO_SPAWN = 10;

/** def ids the engine's spawnEnemy understands. */
const SPAWN_IDS: { label: string; id: string }[] = [
  { label: "rock", id: "rock_normal_medium" },
  { label: "ice", id: "rock_ice_medium" },
  { label: "shooter", id: "raider" },
  { label: "smasher", id: "breaker_medium" },
];

type Stats = ReturnType<DebugApi["stats"]>;

export default function DebugPanel({ api, hud, onClose }: DebugPanelProps) {
  const [stage, setStage] = useState(1);
  const [level, setLevel] = useState(1);
  const [weapon, setWeapon] = useState<WeaponId>(WEAPON_IDS[0] ?? "focus_lance");
  const [skill, setSkill] = useState<SkillId>(SKILL_IDS[0] ?? "reinforced_hull");
  const [god, setGod] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pattern, setPattern] = useState<AttackPatternId>(PATTERN_LIST[0]?.id ?? "forward");
  const [skillLevelId, setSkillLevelId] = useState<SkillId>(SKILL_IDS[0] ?? "reinforced_hull");
  const [skillLevel, setSkillLevel] = useState(1);
  const [tier, setTier] = useState(0);

  const dev = api as DevApi | null;

  useEffect(() => {
    if (!api) return;
    const id = window.setInterval(() => {
      setStats(api.stats());
      setTier(dev?.weaponTier() ?? 0);
    }, 250);
    return () => window.clearInterval(id);
  }, [api, dev]);

  const disabled = !api;
  const fps = stats?.fps ?? hud?.fps ?? 0;
  const entities = stats?.entities ?? hud?.entities ?? 0;

  return (
    <div className="debug-panel no-select" role="region" aria-label="Debug tools">
      <div className="debug-head">
        <b>DEBUG</b>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close debug panel">
          ✕
        </button>
      </div>

      {!api ? <p className="debug-note">debug API unavailable on this engine build</p> : null}

      <div className="debug-readout">
        <span>FPS {Math.round(fps)}</span>
        <span>Ent {entities}</span>
        <span>{stats?.phase ?? hud?.stage ?? "—"}</span>
        <span>Tier {tier}</span>
      </div>

      <fieldset disabled={disabled} className="debug-fields">
        <div className="debug-row">
          <label htmlFor="dbg-stage">Stage</label>
          <input id="dbg-stage" type="number" min={1} max={50} value={stage} onChange={(e) => setStage(Number(e.target.value))} />
          <button type="button" onClick={() => api?.gotoStage(stage)}>
            Go
          </button>
        </div>

        <div className="debug-row">
          <label htmlFor="dbg-level">Level</label>
          <input id="dbg-level" type="number" min={1} max={99} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
          <button type="button" onClick={() => api?.setLevel(level)}>
            Set
          </button>
        </div>

        <div className="debug-row">
          <label htmlFor="dbg-weapon">Weapon</label>
          <select id="dbg-weapon" value={weapon} onChange={(e) => setWeapon(e.target.value as WeaponId)}>
            {WEAPON_IDS.map((id) => (
              <option key={id} value={id}>
                {WEAPONS[id].name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => api?.grantWeapon(weapon)}>
            Grant
          </button>
        </div>

        <div className="debug-row">
          <label htmlFor="dbg-skill">Skill</label>
          <select id="dbg-skill" value={skill} onChange={(e) => setSkill(e.target.value as SkillId)}>
            {SKILL_IDS.map((id) => (
              <option key={id} value={id}>
                {SKILLS[id].name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => api?.grantSkill(skill)}>
            Grant
          </button>
        </div>

        <div className="debug-row">
          <label className="debug-check" htmlFor="dbg-god">
            <input
              id="dbg-god"
              type="checkbox"
              checked={god}
              onChange={(e) => {
                setGod(e.target.checked);
                api?.godMode(e.target.checked);
              }}
            />
            God mode
          </label>
        </div>

        <div className="debug-row">
          <span className="debug-group-label">Spawn</span>
          {SPAWN_IDS.map((s) => (
            <button type="button" key={s.id} onClick={() => api?.spawnEnemy(s.id)}>
              {s.label}
            </button>
          ))}
          <button type="button" onClick={() => api?.spawnBoss(stage)}>
            boss
          </button>
        </div>

        <div className="debug-row">
          <label htmlFor="dbg-time">Time ×</label>
          <input
            id="dbg-time"
            type="number"
            min={0}
            max={4}
            step={0.25}
            value={timeScale}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTimeScale(v);
              api?.setTimeScale(v);
            }}
          />
        </div>

        <div className="debug-row">
          <label htmlFor="dbg-pattern">Pattern</label>
          <select id="dbg-pattern" value={pattern} onChange={(e) => setPattern(e.target.value as AttackPatternId)}>
            {PATTERN_LIST.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => dev?.setPattern(pattern)}>
            Apply
          </button>
        </div>

        <div className="debug-row">
          <label htmlFor="dbg-skill-level">Skill lvl</label>
          <select
            id="dbg-skill-level"
            value={skillLevelId}
            onChange={(e) => setSkillLevelId(e.target.value as SkillId)}
          >
            {SKILL_IDS.map((id) => (
              <option key={id} value={id}>
                {SKILLS[id].name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={99}
            value={skillLevel}
            onChange={(e) => setSkillLevel(Number(e.target.value))}
            aria-label="Skill level value"
          />
          <button type="button" onClick={() => api?.setSkillLevel(skillLevelId, skillLevel)}>
            Set
          </button>
        </div>

        <div className="debug-row">
          <span className="debug-group-label">Dev</span>
          <button type="button" onClick={() => api?.clearEnemies()}>
            clear enemies
          </button>
          <button
            type="button"
            onClick={() => {
              for (let i = 0; i < ROCKS_TO_SPAWN; i++) api?.spawnEnemy("rock_normal_medium");
            }}
          >
            spawn 10 rocks
          </button>
          <button
            type="button"
            onClick={() => {
              api?.godMode(true);
              setGod(true);
              api?.setLevel(50);
            }}
          >
            god mode + Lv 50
          </button>
        </div>
      </fieldset>
    </div>
  );
}
