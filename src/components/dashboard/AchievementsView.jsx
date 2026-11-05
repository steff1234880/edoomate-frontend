import React, { useState } from 'react'
import { studentData } from '../../data/studentData'

export default function AchievementsView({ onBack }) {
  const [claimedReward, setClaimedReward] = useState(false)

  const badges = [
    { id: 1, title: 'Science Whiz', desc: 'Complete 2 physics modules with 80% score', icon: '🏆', status: 'unlocked', xp: '+100 XP' },
    { id: 2, title: '5-Day Streak', desc: 'Log in and study 5 consecutive days', icon: '🔥', status: 'unlocked', xp: '+50 XP' },
    { id: 3, title: 'Math Genius', desc: 'Score 90% or higher on Algebra test', icon: '📐', status: 'unlocked', xp: '+75 XP' },
    { id: 4, title: 'Quiz Master', desc: 'Pass 10 lesson quizzes on first attempt', icon: '⚡', status: 'locked', progress: '7/10 Quizzes', xp: '+120 XP' },
    { id: 5, title: 'Peer Collaborator', desc: 'Participate in 3 virtual classroom study groups', icon: '👥', status: 'locked', progress: '1/3 Sessions', xp: '+80 XP' },
    { id: 6, title: 'Course Finisher', desc: '100% completion on any full subject curriculum', icon: '🎓', status: 'locked', progress: '65% Complete', xp: '+250 XP' },
  ]

  return (
    <div className="achievements-view animate-fade-in">
      {/* Top Navigation */}
      <div className="d-flex align-items-center justify-content-between p-3 bg-white border-bottom rounded-4 mb-4 shadow-sm gap-2">
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
          onClick={onBack}
          aria-label="Back to Dashboard"
          title="Back to Dashboard"
          style={{ width: '32px', height: '32px', padding: 0 }}
        >
          ←
        </button>
        <div className="d-flex align-items-center gap-2 gap-sm-3 flex-shrink-0">
          <span className="badge bg-warning bg-opacity-10 text-dark border border-warning px-3 py-2 rounded-pill small fw-semibold">
            ⭐ Total XP: {studentData.profile.xp}
          </span>
          <span className="badge bg-primary bg-opacity-10 text-primary border border-primary px-3 py-2 rounded-pill small fw-semibold">
            💎 Gems: {studentData.profile.gems}
          </span>
        </div>
      </div>

      {/* Level Banner */}
      <div className="card border-0 rounded-4 shadow-sm p-4 mb-4 bg-white">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
          <div>
            <span className="badge bg-primary px-3 py-1 rounded-pill small mb-2">Academic Rank</span>
            <h3 className="fw-bold mb-1 fs-5">Level 7 • Senior Scholar</h3>
            <p className="text-muted small mb-0">
              Only 580 XP remaining to unlock <strong>Level 8 • Honors Master</strong>!
            </p>
          </div>
          <div>
            <button
              type="button"
              className={`btn btn-sm rounded-pill px-4 fw-semibold ${
                claimedReward ? 'btn-success' : 'btn-primary'
              }`}
              onClick={() => setClaimedReward(true)}
              disabled={claimedReward}
            >
              {claimedReward ? 'Level Reward Claimed ✓' : 'Claim Daily Bonus (+20 Gems)'}
            </button>
          </div>
        </div>

        {/* Level XP Bar */}
        <div className="mb-2">
          <div className="d-flex justify-content-between align-items-center small mb-1 fw-semibold text-secondary">
            <span>3,420 XP</span>
            <span>4,000 XP Goal</span>
          </div>
          <div className="progress" style={{ height: '10px' }}>
            <div
              className="progress-bar progress-bar-striped progress-bar-animated bg-primary"
              style={{ width: '85.5%' }}
            ></div>
          </div>
        </div>
      </div>

      {/* Badges Grid */}
      <div className="card border-0 rounded-4 shadow-sm p-4 bg-white">
        <h4 className="fw-bold fs-6 mb-3">Achievements & Badges</h4>
        <div className="row g-3">
          {badges.map((b) => (
            <div key={b.id} className="col-12 col-md-6 col-lg-4">
              <div
                className={`p-3 rounded-4 border h-100 d-flex flex-column justify-content-between ${
                  b.status === 'unlocked' ? 'bg-light border-primary' : 'bg-white opacity-75'
                }`}
              >
                <div className="d-flex align-items-start gap-3">
                  <span
                    className="rounded-circle d-flex align-items-center justify-content-center fs-3 flex-shrink-0"
                    style={{
                      width: '52px',
                      height: '52px',
                      backgroundColor: b.status === 'unlocked' ? '#eff6ff' : '#f1f5f9',
                    }}
                  >
                    {b.icon}
                  </span>
                  <div>
                    <div className="d-flex align-items-center gap-2">
                      <h5 className="fw-bold small mb-0 text-dark">{b.title}</h5>
                      <span
                        className={`badge rounded-pill ${
                          b.status === 'unlocked' ? 'bg-success' : 'bg-secondary'
                        }`}
                        style={{ fontSize: '0.62rem' }}
                      >
                        {b.status === 'unlocked' ? 'Unlocked' : 'Locked'}
                      </span>
                    </div>
                    <p className="text-muted smaller mb-2 mt-1" style={{ fontSize: '0.73rem', lineHeight: '1.4' }}>
                      {b.desc}
                    </p>
                  </div>
                </div>

                <div className="d-flex justify-content-between align-items-center pt-2 border-top mt-2">
                  <span className="small text-primary fw-bold">{b.xp}</span>
                  {b.progress && <span className="small text-muted">{b.progress}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
