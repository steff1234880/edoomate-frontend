/**
 * Edoomate Student Dashboard Mock Data
 * Structured to represent student courses, performance metrics, and leaderboard.
 * Easily swappable when backend student APIs are provided.
 */

import kristinAvatar from '../assets/dashboard/kristin-avatar-clean.jpg'
import classroomGirlImg from '../assets/dashboard/classroom-girl-hd.jpg'
import classroomGirlBlueImg from '../assets/dashboard/classroom-girl-blue.jpg'
import bannerVortexImg from '../assets/dashboard/banner-vortex-hd.jpg'
import physicsThumb from '../assets/dashboard/course-physics-hd.jpg'
import historyThumb from '../assets/dashboard/course-history-hd.jpg'
import mathThumb from '../assets/dashboard/course-math-hd.jpg'

export const studentData = {
  profile: {
    name: 'Kristin',
    avatar: kristinAvatar,
    status: 'online',
    greeting: 'Ready to learn something new?',
    gems: '1,000',
    xp: '265 XP',
  },

  featuredCourse: {
    id: 'feat-physics',
    tag: 'In Progress',
    badge: 'GRADE 10',
    subject: 'PHYSICS',
    title: 'Advanced Physics: Kinematics',
    description: "Chapter 4: Projectile Motion. You're almost done with this module!",
    progress: 65,
    actionText: 'Resume Lesson',
    vortexImage: bannerVortexImg,
    thumbnail: physicsThumb,
    videoUrl: 'https://edoomate.myieltspartner.com/storage/course_videos/PCfnUlj4kdzWzUZIBlGvPpjfVE89M9PiACqAdT8D.mp4',
    modules: [
      {
        id: 'mod-1',
        title: 'Module 1: Vectors & Coordinate Systems',
        lessons: [
          {
            id: 'lesson-1-1',
            title: 'Vectors & Coordinate Systems in 2D',
            duration: '18 min',
            type: 'video',
            videoUrl: 'https://edoomate.myieltspartner.com/storage/course_videos/PCfnUlj4kdzWzUZIBlGvPpjfVE89M9PiACqAdT8D.mp4',
            description: 'Introduction to vector components, unit vector notation, and Cartesian projections.',
          },
          {
            id: 'lesson-1-2',
            title: 'Velocity & Displacement in 1D',
            duration: '24 min',
            type: 'video',
            videoUrl: 'https://edoomate.myieltspartner.com/storage/course_videos/PCfnUlj4kdzWzUZIBlGvPpjfVE89M9PiACqAdT8D.mp4',
            description: 'Analyzing position-time graphs, instantaneous velocity, and integration of rate of change.',
          },
        ],
      },
      {
        id: 'mod-2',
        title: 'Module 2: Acceleration & Free Fall',
        lessons: [
          {
            id: 'lesson-2-1',
            title: 'Uniform Acceleration & Kinematic Equations',
            duration: '32 min',
            type: 'video',
            videoUrl: 'https://edoomate.myieltspartner.com/storage/course_videos/PCfnUlj4kdzWzUZIBlGvPpjfVE89M9PiACqAdT8D.mp4',
            description: 'Deriving the big five kinematic equations and applying them to braking distance scenarios.',
          },
          {
            id: 'lesson-2-2',
            title: 'Free Fall & Gravitational Acceleration',
            duration: '22 min',
            type: 'reading',
            videoUrl: null, // Reading lesson without video
            description: 'Understanding free fall under constant g = 9.8 m/s² and symmetry in upward/downward trajectories.',
          },
        ],
      },
      {
        id: 'mod-3',
        title: 'Module 3: Projectile Motion & 2D Dynamics',
        lessons: [
          {
            id: 'lesson-3-1',
            title: 'Projectile Motion & Parabolic Trajectory',
            duration: '28 min',
            type: 'video',
            videoUrl: 'https://edoomate.myieltspartner.com/storage/course_videos/PCfnUlj4kdzWzUZIBlGvPpjfVE89M9PiACqAdT8D.mp4',
            description: 'Resolving initial velocity into vx and vy components. Calculating maximum height and range.',
          },
          {
            id: 'lesson-3-2',
            title: '2D Relative Velocity & Angular Frames',
            duration: '35 min',
            type: 'reading',
            videoUrl: null,
            description: 'Frame of reference transformations and wind-drift problems for aircraft navigation.',
          },
          {
            id: 'lesson-3-3',
            title: 'Capstone Practice & Problem Solving',
            duration: '45 min',
            type: 'quiz',
            videoUrl: null,
            description: 'Comprehensive problem set testing multi-stage kinematic trajectories and exam problems.',
          },
        ],
      },
    ],
  },

  virtualClassroom: {
    tag: 'Live Now',
    tutorImage: classroomGirlBlueImg,
    title: 'Virtual Class Room',
    description: 'Join your AI-powered study room to collaborate with peers and access instant tutoring.',
    actionText: 'Enter Classroom',
    liveSession: {
      title: 'Advanced Physics',
      peersCount: '4 peers inside',
      peersAvatars: [
        { label: 'AJ', bg: '#3b82f6' },
        { label: 'MK', bg: '#10b981' },
      ],
      extraCount: '+2',
    },
  },

  courses: [
    {
      id: 1,
      badge: 'GRADE 10',
      subject: 'PHYSICS',
      title: 'Physics: Forces & Motion',
      thumbnail: physicsThumb,
      lessons: '32 Lessons',
      status: 'Not Started',
      progress: 0,
      color: '#7c3aed',
      actionText: 'Start Learning',
      isPrimary: true,
      videoUrl: 'https://edoomate.myieltspartner.com/storage/course_videos/PCfnUlj4kdzWzUZIBlGvPpjfVE89M9PiACqAdT8D.mp4',
      modules: [
        {
          id: 'pfm-m1',
          title: 'Module 1: Newton’s Laws of Motion',
          lessons: [
            {
              id: 'pfm-1',
              title: 'First Law & Inertial Reference Frames',
              duration: '20 min',
              type: 'video',
              videoUrl: 'https://edoomate.myieltspartner.com/storage/course_videos/PCfnUlj4kdzWzUZIBlGvPpjfVE89M9PiACqAdT8D.mp4',
              description: "Exploring Galileo's thought experiment and Newton's formulation of inertia.",
            },
            {
              id: 'pfm-2',
              title: 'Second Law: F = ma and Net Force Analysis',
              duration: '28 min',
              type: 'video',
              videoUrl: 'https://edoomate.myieltspartner.com/storage/course_videos/PCfnUlj4kdzWzUZIBlGvPpjfVE89M9PiACqAdT8D.mp4',
              description: 'Free-body diagrams, resolving force vectors, and accelerating systems.',
            },
          ],
        },
        {
          id: 'pfm-m2',
          title: 'Module 2: Friction, Tension & Normal Forces',
          lessons: [
            {
              id: 'pfm-3',
              title: 'Static and Kinetic Friction Mechanics',
              duration: '25 min',
              type: 'reading',
              videoUrl: null,
              description: 'Coefficients of friction, inclined planes, and empirical friction models.',
            },
            {
              id: 'pfm-4',
              title: 'Tension & Multi-Body Connected Systems',
              duration: '30 min',
              type: 'reading',
              videoUrl: null,
              description: 'Atwood machines, pulley systems, and internal versus external forces.',
            },
          ],
        },
      ],
    },
    {
      id: 2,
      badge: 'GRADE 9',
      subject: 'HISTORY',
      title: 'World History: Ancient Civilizations',
      thumbnail: historyThumb,
      lessons: '28 Lessons',
      status: '12% Done',
      progress: 12,
      progressColor: '#f97316',
      actionText: 'Continue',
      isPrimary: false,
      videoUrl: null, // Pure reading and document study course
      modules: [
        {
          id: 'wh-m1',
          title: 'Module 1: The Fertile Crescent & Mesopotamia',
          lessons: [
            {
              id: 'wh-1',
              title: 'Agricultural Revolution & Sumerian City-States',
              duration: '22 min',
              type: 'reading',
              videoUrl: null,
              description: 'Early irrigation, cuneiform writing, and the rise of organized urban settlements.',
            },
            {
              id: 'wh-2',
              title: 'The Code of Hammurabi & Babylonian Law',
              duration: '18 min',
              type: 'reading',
              videoUrl: null,
              description: 'Primary source analysis of ancient legal codes and royal decrees.',
            },
          ],
        },
        {
          id: 'wh-m2',
          title: 'Module 2: Ancient Egypt & The Nile Valley',
          lessons: [
            {
              id: 'wh-3',
              title: 'Old Kingdom Pharaonic Rule & Monumental Architecture',
              duration: '25 min',
              type: 'reading',
              videoUrl: null,
              description: 'Divine kingship, pyramid construction logistics, and trade networks.',
            },
          ],
        },
      ],
    },
    {
      id: 3,
      badge: 'GRADE 10',
      subject: 'MATHEMATICS',
      title: 'Mathematics: Algebra & Geometry',
      thumbnail: mathThumb,
      lessons: '45 Lessons',
      status: '38% Done',
      progress: 38,
      progressColor: '#22c55e',
      actionText: 'Continue',
      isPrimary: false,
      videoUrl: null,
      modules: [
        {
          id: 'math-m1',
          title: 'Module 1: Quadratic Functions & Polynomials',
          lessons: [
            {
              id: 'math-1',
              title: 'Completing the Square & Quadratic Formula',
              duration: '24 min',
              type: 'reading',
              videoUrl: null,
              description: 'Algebraic derivations of the quadratic formula and discriminant analysis.',
            },
            {
              id: 'math-2',
              title: 'Graphing Parabolas: Vertex, Axis, and Intercepts',
              duration: '30 min',
              type: 'reading',
              videoUrl: null,
              description: 'Transformations of quadratic graphs and vertex form f(x) = a(x - h)² + k.',
            },
          ],
        },
        {
          id: 'math-m2',
          title: 'Module 2: Euclidean & Coordinate Geometry',
          lessons: [
            {
              id: 'math-3',
              title: 'Coordinate Proofs & Distance Invariance',
              duration: '26 min',
              type: 'reading',
              videoUrl: null,
              description: 'Pythagorean distance formula, midpoint proofs, and circle equations.',
            },
          ],
        },
      ],
    },
    {
      id: 4,
      badge: 'GRADE 11',
      subject: 'ENGLISH',
      title: 'Advanced English Communication',
      thumbnail: classroomGirlImg,
      lessons: '24 Lessons',
      status: '75% Done',
      progress: 75,
      progressColor: '#2563eb',
      actionText: 'Resume Lesson',
      isPrimary: false,
      videoUrl: 'https://edoomate.myieltspartner.com/storage/course_videos/rfJ832pvWJrc2wnwR7QdEFT5bNi8z8Qh0Fe5ovug.mp4',
      modules: [
        {
          id: 'eng-m1',
          title: 'Module 1: Rhetorical Strategy & Active Listening',
          lessons: [
            {
              id: 'eng-1',
              title: 'Ethos, Pathos, and Logos in Discourse',
              duration: '16 min',
              type: 'video',
              videoUrl: 'https://edoomate.myieltspartner.com/storage/course_videos/rfJ832pvWJrc2wnwR7QdEFT5bNi8z8Qh0Fe5ovug.mp4',
              description: 'Classical rhetoric techniques applied to persuasive modern communications.',
            },
          ],
        },
        {
          id: 'eng-m4',
          title: 'Module 4: Business Speaking',
          lessons: [
            {
              id: 'eng-4-1',
              title: 'Cross-Cultural Negotiation Tactics',
              duration: '25 min',
              type: 'video',
              videoUrl: 'https://edoomate.myieltspartner.com/storage/course_videos/rfJ832pvWJrc2wnwR7QdEFT5bNi8z8Qh0Fe5ovug.mp4',
              description: 'Navigating international diplomacy, high-context versus low-context dialogue.',
            },
            {
              id: 'eng-4-2',
              title: 'Executive Q&A and Spontaneous Responses',
              duration: '22 min',
              type: 'video',
              videoUrl: 'https://edoomate.myieltspartner.com/storage/course_videos/rfJ832pvWJrc2wnwR7QdEFT5bNi8z8Qh0Fe5ovug.mp4',
              description: 'Structuring clear, concise answers under pressure using the PREP method.',
            },
          ],
        },
      ],
    },
    {
      id: 5,
      badge: 'ALL LEVELS',
      subject: 'ARTS',
      title: 'Digital Art Fundamentals',
      thumbnail: bannerVortexImg,
      lessons: '15 Lessons',
      status: 'Not Started',
      progress: 0,
      color: '#ec4899',
      actionText: 'Start Learning',
      isPrimary: false,
      videoUrl: null,
      modules: [
        {
          id: 'art-m1',
          title: 'Module 1: Color Theory & Composition',
          lessons: [
            {
              id: 'art-1',
              title: 'Harmonic Palettes & Value Contrast',
              duration: '20 min',
              type: 'reading',
              videoUrl: null,
              description: 'Understanding hue, saturation, value, and color psychology.',
            },
          ],
        },
      ],
    },
  ],

  performance: {
    streak: {
      label: 'Current Streak',
      value: '5 Days',
    },
    gems: {
      label: 'Total Gems',
      value: '1,250',
    },
    experience: {
      label: 'Experience',
      value: '3,420 XP',
    },
  },

  activeSubjects: [
    {
      id: 1,
      title: 'Calculus II',
      topic: 'Integration Techniques',
      lastActive: 'Last active: 2 hours ago',
      progress: 80,
      color: '#2563eb',
      iconType: 'math',
    },
    {
      id: 2,
      title: 'Organic Chemistry',
      topic: 'Hydrocarbons',
      lastActive: 'Last active: Yesterday',
      progress: 45,
      color: '#9333ea',
      iconType: 'chemistry',
    },
    {
      id: 3,
      title: 'World Literature',
      topic: 'Renaissance Poetry',
      lastActive: 'Last active: 3 days ago',
      progress: 15,
      color: '#10b981',
      iconType: 'literature',
    },
  ],

  weeklyProgress: {
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    values: [22, 58, 88, 52, 68, 6, 6], // matching curve in screenshot
  },

  dailyChallenge: {
    timeLeft: '12h left',
    reward: '50 XP',
    description:
      'Complete 2 physics lessons today to unlock the "Science Whiz" badge and customize your avatar.',
  },

  leaderboard: [
    {
      rank: 1,
      name: 'Alex R.',
      tag: 'Science Whiz',
      score: '4,200 XP',
      isTop: true,
    },
    {
      rank: 2,
      name: 'Sarah M.',
      tag: 'Math Genius',
      score: '3,850 XP',
    },
    {
      rank: 3,
      name: 'David K.',
      tag: 'History Buff',
      score: '3,610 XP',
    },
    {
      rank: 4,
      name: 'Kristin',
      tag: 'You',
      score: '3,420 XP',
      isUser: true,
    },
  ],

  fullLeaderboard: [
    {
      rank: 1,
      name: 'John Doe',
      points: 1200,
      pointsFormatted: '1200pts',
      trend: 'up',
      isPodium: true,
      podiumPosition: 'center',
    },
    {
      rank: 2,
      name: 'Bradley Henry',
      points: 900,
      pointsFormatted: '900pts',
      trend: 'neutral',
      isPodium: true,
      podiumPosition: 'left',
    },
    {
      rank: 3,
      name: 'Guy Hawkins',
      points: 900,
      pointsFormatted: '900pts',
      trend: 'neutral',
      isPodium: true,
      podiumPosition: 'right',
    },
    {
      rank: 4,
      name: 'Jenny Wilson',
      points: 887,
      pointsFormatted: '887pts',
      trend: 'down',
    },
    {
      rank: 5,
      name: 'Annette Black',
      points: 750,
      pointsFormatted: '750pts',
      trend: 'up',
    },
    {
      rank: 6,
      name: 'Marvin McKinney',
      points: 748,
      pointsFormatted: '748pts',
      trend: 'down',
    },
    {
      rank: 7,
      name: 'Wade Warren',
      points: 546,
      pointsFormatted: '546pts',
      trend: 'up',
    },
    {
      rank: 8,
      name: 'You',
      studentActualName: 'Kristin Watson',
      points: 489,
      pointsFormatted: '489pts',
      trend: 'up',
      isUser: true,
    },
    {
      rank: 9,
      name: 'Devon Lane',
      points: 387,
      pointsFormatted: '387pts',
      trend: 'up',
    },
    {
      rank: 10,
      name: 'Theresa Webb',
      points: 302,
      pointsFormatted: '302pts',
      trend: 'neutral',
    },
  ],

  courseProgression: [
    {
      title: 'Mathematics',
      lessons: '24/30 Lessons',
      progress: 80,
      color: '#2563eb',
    },
    {
      title: 'Physics',
      lessons: '13/20 Lessons',
      progress: 65,
      color: '#2563eb',
    },
    {
      title: 'English Literature',
      lessons: '6/20 Lessons',
      progress: 30,
      color: '#10b981',
    },
  ],
}
