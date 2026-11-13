"use client";

export interface StageBannerData {
  stage: number;
  sector: number;
  title: string;
}

export interface BossIntroData {
  name: string;
  title: string;
  stage: number;
}

export interface BannerProps {
  stage?: StageBannerData | null;
  boss?: BossIntroData | null;
  countdown?: number | null;
}

/** Big centred banners: stage intro, boss WARNING, and the 3-2-1 countdown. */
export default function Banner({ stage, boss, countdown }: BannerProps) {
  if (countdown !== null && countdown !== undefined && countdown > 0) {
    return (
      <div className="banner banner-center" role="status" aria-live="assertive">
        <div className="countdown" key={countdown}>
          {countdown}
        </div>
      </div>
    );
  }

  if (boss) {
    return (
      <div className="banner banner-center banner-boss" role="alert">
        <div className="banner-warning">WARNING</div>
        <div className="banner-title">{boss.name}</div>
        <div className="banner-sub">{boss.title}</div>
      </div>
    );
  }

  if (stage) {
    return (
      <div className="banner banner-top" role="status" aria-live="polite">
        <div className="banner-kicker">Sector {stage.sector}</div>
        <div className="banner-stage">Stage {stage.stage}</div>
        <div className="banner-sub">{stage.title}</div>
      </div>
    );
  }

  return null;
}
