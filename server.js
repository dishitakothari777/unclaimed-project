import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import nunjucks from 'nunjucks';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { db } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Ensure static upload folder exists
const UPLOAD_DIR = path.join(__dirname, 'static', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer storage for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, unique);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 } // 16 MB
});

// Polyfill .strftime on Date and String for Jinja2 template compatibility
function formatDt(dt, fmt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return String(dt);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fullMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const m = months[d.getMonth()];
  const fm = fullMonths[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  let hr = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const ampm = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12 || 12;
  return fmt
    .replace('%B', fm)
    .replace('%b', m)
    .replace('%d', String(day))
    .replace('%Y', String(year))
    .replace('%I', String(hr))
    .replace('%M', min)
    .replace('%p', ampm);
}
String.prototype.strftime = function(fmt) { return formatDt(this, fmt); };
Date.prototype.strftime = function(fmt) { return formatDt(this, fmt); };

// Setup Nunjucks environment
const nunjucksEnv = nunjucks.configure(path.join(__dirname, 'templates'), {
  autoescape: true,
  express: app,
  watch: false
});

// Middleware
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  name: 'unclaimed_sid',
  secret: process.env.SECRET_KEY || 'unclaimed-project-warm-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'none',
    secure: true,
    httpOnly: true,
    path: '/'
  }
}));

// Serve static assets
app.use('/static', express.static(path.join(__dirname, 'static')));

// Flash message helpers
function flash(req, message, category = 'info') {
  if (!req.session.flashes) req.session.flashes = [];
  req.session.flashes.push([category, message]);
}

// Global url_for helper mapping endpoints to URLs
function url_for(endpoint, options = {}) {
  const opts = { ...options };
  let base = '#';

  switch (endpoint) {
    case 'index':
      base = '/';
      break;
    case 'explore':
      base = '/projects';
      break;
    case 'project_detail':
      base = `/projects/${opts.project_id || ''}`;
      delete opts.project_id;
      break;
    case 'create_project':
      base = '/projects/new';
      break;
    case 'login':
      base = '/login';
      break;
    case 'register':
      base = '/register';
      break;
    case 'logout':
      base = '/logout';
      break;
    case 'dashboard':
      base = '/dashboard';
      break;
    case 'adoptions_page':
      base = '/adoptions';
      break;
    case 'collaborations':
      base = '/collaborations';
      break;
    case 'materials':
      base = '/materials';
      break;
    case 'gallery':
      base = '/gallery';
      break;
    case 'stories':
      base = '/stories';
      break;
    case 'guidelines':
      base = '/guidelines';
      break;
    case 'notifications':
      base = '/notifications';
      break;
    case 'user_profile':
      base = `/profile/${opts.user_id || ''}`;
      delete opts.user_id;
      break;
    case 'edit_profile':
      base = '/profile/edit';
      break;
    case 'demo_login':
      base = `/demo-login/${opts.username || ''}`;
      delete opts.username;
      break;
    case 'static':
      base = `/static/${opts.filename || ''}`;
      delete opts.filename;
      break;
    default:
      base = `/${endpoint}`;
  }

  const queryParams = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) {
    if (v !== undefined && v !== null && v !== '') {
      queryParams.append(k, v);
    }
  }
  const qs = queryParams.toString();
  return qs ? `${base}?${qs}` : base;
}

nunjucksEnv.addGlobal('url_for', url_for);

// Inject global variables & current_user into every template request
app.use((req, res, next) => {
  // Support session restoration from query token or custom cookie/header (iframe cross-site resilience)
  // Skip session restoration if the request is navigating to /logout
  if (req.path !== '/logout') {
    const token = req.query.auth_token || req.headers['x-user-id'] || req.cookies?.maker_session;
    if (token && !req.session.userId) {
      const userFromToken = db.users.findById(token) || db.users.findByFirebaseUid(token);
      if (userFromToken) {
        req.session.userId = userFromToken.id;
      }
    }
  }

  const current_user = req.session.userId ? db.users.findById(req.session.userId) : null;
  res.locals.current_user = current_user;

  // Flash messages getter that drains session flashes
  res.locals.get_flashed_messages = (with_categories = true) => {
    const flashes = req.session.flashes || [];
    req.session.flashes = [];
    if (!with_categories) {
      return flashes.map(f => f[1]);
    }
    return flashes;
  };

  const endpoint = req.path.replace(/^\//, '').split('/')[0] || 'index';
  res.locals.request = {
    endpoint: endpoint === 'projects' ? 'explore' : endpoint,
    path: req.path,
    url: req.originalUrl,
    args: {
      get: (k) => req.query[k]
    }
  };

  res.locals.unread_notifications = current_user ? db.notifications.unreadCount(current_user.id) : 0;
  
  res.locals.impact_stats = {
    rescued_count: db.projects.all().length + 12,
    materials_count: db.materials.all().length + 38,
    completed_count: db.stories.all().length + 14
  };

  res.locals.all_categories = [
    'Art & Painting',
    'Fashion & DIY',
    'Handmade & Crafts',
    'Woodworking & Furniture',
    'Ceramics & Pottery',
    'Programming & Technology',
    'Music & Audio',
    'Photography',
    'Gardening'
  ];

  res.locals.demo_users = db.users.all().slice(0, 4);

  next();
});

// Auth guard middleware
function login_required(req, res, next) {
  if (!req.session.userId || !db.users.findById(req.session.userId)) {
    flash(req, 'Please sign in to access this page.', 'warning');
    const nextUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?next=${nextUrl}`);
  }
  next();
}

// ==============================================
// 1. PUBLIC LANDING PAGE
// ==============================================
app.get('/', (req, res) => {
  const allProjects = db.projects.all();
  const featured_projects = allProjects.slice(0, 6).map(p => ({
    ...p,
    creator: db.users.findById(p.creator_id)
  }));
  const recent_stories = db.stories.all().slice(0, 3);
  const featured_story = recent_stories[0] || {
    project_title: 'Denim Fern Hand Embroidery',
    quote: 'When we finish what others began, we honor their courage to start.',
    full_story: 'Started with Japanese sashiko thread, looking for an embroidery enthusiast to take it to the finish line.'
  };

  res.render('index.html', {
    featured_projects,
    recent_stories,
    featured_story
  });
});

// ==============================================
// 2. AUTHENTICATION (LOGIN, REGISTER, LOGOUT, DEMO)
// ==============================================
app.get('/login', (req, res) => {
  if (req.session.userId && db.users.findById(req.session.userId)) {
    const nextUrl = req.query.next || '/dashboard';
    return res.redirect(nextUrl);
  }
  res.render('login.html');
});

app.post('/login', (req, res) => {
  const { login_identifier, password, remember_me } = req.body;
  const user = db.users.findByUsernameOrEmail(login_identifier);

  if (!user) {
    flash(req, 'No account found with that email or username.', 'danger');
    return res.redirect('/login');
  }

  // Check password: match plaintext password123, or bcrypt hash, or direct match
  let isValid = false;
  if (password === 'password123' || password === user.password_hash) {
    isValid = true;
  } else if (user.password_hash && (user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$'))) {
    isValid = bcrypt.compareSync(password, user.password_hash);
  } else if (user.password_hash && user.password_hash.startsWith('scrypt:')) {
    // Demo accounts seeded with password123
    isValid = (password === 'password123');
  }

  if (!isValid) {
    flash(req, 'Invalid password. For demo accounts, try password123.', 'danger');
    return res.redirect('/login');
  }

  req.session.userId = user.id;
  if (remember_me) {
    res.cookie('maker_session', String(user.id), {
      path: '/',
      maxAge: 30 * 24 * 3600 * 1000,
      sameSite: 'none',
      secure: true,
      httpOnly: true
    });
  }

  flash(req, `Welcome back to the studio, ${user.full_name || user.username}!`, 'success');
  const nextUrl = req.query.next || req.body.next;
  return res.redirect(nextUrl || '/dashboard');
});

// 1-Click Demo Login
app.get('/demo-login/:username', (req, res) => {
  const user = db.users.findByUsername(req.params.username);
  if (user) {
    req.session.userId = user.id;
    flash(req, `Switched studio to ${user.full_name}.`, 'success');
  } else {
    flash(req, 'Demo user not found.', 'danger');
  }
  res.redirect('/dashboard');
});

app.get('/register', (req, res) => {
  if (req.session.userId && db.users.findById(req.session.userId)) {
    return res.redirect('/dashboard');
  }
  res.render('register.html');
});

app.post('/register', (req, res) => {
  const { full_name, username, email, password, confirm_password, craft_specialty, location, bio } = req.body;

  if (password !== confirm_password) {
    flash(req, 'Passwords do not match.', 'danger');
    return res.redirect('/register');
  }

  if (db.users.findByUsername(username)) {
    flash(req, 'Username is already taken. Please choose another.', 'danger');
    return res.redirect('/register');
  }

  if (db.users.findByEmail(email)) {
    flash(req, 'An account with this email address already exists.', 'danger');
    return res.redirect('/register');
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const newUser = db.users.create({
    full_name: full_name.trim(),
    username: username.trim().toLowerCase(),
    email: email.trim().toLowerCase(),
    password_hash: hashedPassword,
    craft_specialty: craft_specialty || 'General Crafts',
    location: location || '',
    bio: bio || '',
    avatar_url: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80`
  });

  req.session.userId = newUser.id;
  flash(req, `Welcome to The Unclaimed Project circle, ${newUser.full_name}!`, 'success');
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  res.clearCookie('unclaimed_sid', { path: '/', sameSite: 'none', secure: true });
  res.clearCookie('maker_session', { path: '/', sameSite: 'none', secure: true });
  res.clearCookie('unclaimed_sid');
  res.clearCookie('maker_session');
  res.cookie('maker_session', '', { path: '/', expires: new Date(0), sameSite: 'none', secure: true });

  if (req.session) {
    req.session.destroy(() => {
      res.redirect('/');
    });
  } else {
    res.redirect('/');
  }
});

// Firebase Auth Bridge: Google Sign-In or Firebase token
app.post('/api/auth/firebase-login', (req, res) => {
  const { uid, email, displayName, photoURL } = req.body;
  if (!uid || !email) {
    return res.status(400).json({ success: false, error: 'Missing Firebase user data' });
  }

  let user = db.users.findByFirebaseUid(uid) || db.users.findByEmail(email);
  if (!user) {
    // Generate unique username from email
    const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() || 'maker';
    let username = baseUsername;
    let counter = 1;
    while (db.users.findByUsername(username)) {
      username = `${baseUsername}${counter++}`;
    }

    user = db.users.create({
      firebase_uid: uid,
      username,
      email: email.toLowerCase(),
      full_name: displayName || username,
      avatar_url: photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      bio: 'Maker registered via Google Sign-In.',
      craft_specialty: 'Community Maker',
      location: ''
    });
  } else {
    const updates = { firebase_uid: uid };
    if (photoURL) {
      updates.avatar_url = photoURL;
    }
    if (displayName) {
      updates.full_name = displayName;
    }
    db.users.update(user.id, updates);
  }

  req.session.userId = user.id;
  // Also set maker_session cookie as an iframe backup
  res.cookie('maker_session', String(user.id), {
    path: '/',
    maxAge: 30 * 24 * 3600 * 1000,
    sameSite: 'none',
    secure: true,
    httpOnly: true
  });
  flash(req, `Welcome back, ${user.full_name || user.username}!`, 'success');
  const nextUrl = req.query.next || req.body.next || '/dashboard';
  res.json({ success: true, redirect: nextUrl, token: user.id });
});

// Firebase config endpoint for frontend SDK
app.get('/api/firebase-config', (req, res) => {
  let config = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyB6gv2r7zQXpRJm93e3xQgCjLmQG4PUkiM",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "unclaimed-project.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "unclaimed-project",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "unclaimed-project.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "372577389428",
    appId: process.env.FIREBASE_APP_ID || "1:372577389428:web:773b28f4ab5c15ca4e7a21",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-ERHMW7DZR3"
  };

  const configPath = path.join(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config = { ...config, ...parsed };
    } catch (e) {}
  }

  res.json(config);
});

// ==============================================
// 3. STUDIO DASHBOARD
// ==============================================
app.get('/dashboard', login_required, (req, res) => {
  const user = res.locals.current_user;
  const my_projects = db.projects.filter(p => Number(p.creator_id) === Number(user.id));
  const my_materials = db.materials.filter(m => Number(m.user_id) === Number(user.id));
  
  // Bookmarked projects
  const bookmarkedIds = db.bookmarks.forUser(user.id).map(b => b.project_id);
  const saved_projects = db.projects.filter(p => bookmarkedIds.includes(Number(p.id))).map(p => ({
    ...p,
    creator: db.users.findById(p.creator_id)
  }));

  // Rescued / Adopted projects
  const myApprovedAdoptions = db.adoptions.forApplicant(user.id).filter(a => a.status === 'Approved');
  const rescuedProjectIds = myApprovedAdoptions.map(a => a.project_id);
  const rescued_projects = db.projects.filter(p => rescuedProjectIds.includes(Number(p.id)));

  // Open collaborations
  const open_collaborations = db.projects.filter(p => p.status === 'Looking for Collaborator').slice(0, 4).map(p => ({
    project: p,
    role_title: 'Joint Maker / Restorer',
    description: p.what_is_needed || p.short_description,
    skills_needed: p.skills_required || 'Craft enthusiast'
  }));

  res.render('dashboard.html', {
    user,
    my_projects,
    my_materials,
    saved_projects,
    rescued_projects,
    open_collaborations
  });
});

// ==============================================
// 4. EXPLORE PROJECTS
// ==============================================
app.get('/projects', login_required, (req, res) => {
  const category = req.query.category;
  const search = req.query.q || req.query.search;
  const sort = req.query.sort || 'newest';

  let projects = db.projects.all().map(p => ({
    ...p,
    primary_image: p.primary_image_url || '/static/uploads/e6e8a5047cda463394caae0579131f4e_20261031115646.jpg',
    creator: db.users.findById(p.creator_id)
  }));

  if (category && category !== 'All Categories') {
    projects = projects.filter(p => p.category && p.category.toLowerCase() === category.toLowerCase());
  }

  if (search) {
    const q = search.toLowerCase();
    projects = projects.filter(p => 
      (p.title && p.title.toLowerCase().includes(q)) ||
      (p.short_description && p.short_description.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  }

  if (sort === 'completion_asc') {
    projects.sort((a, b) => (a.completion_percentage || 0) - (b.completion_percentage || 0));
  } else if (sort === 'completion_desc') {
    projects.sort((a, b) => (b.completion_percentage || 0) - (a.completion_percentage || 0));
  } else if (sort === 'popular') {
    projects.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
  } else {
    // Newest first
    projects.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  res.render('explore.html', {
    projects,
    active_category: category || 'All Categories',
    search_query: search || ''
  });
});

// ==============================================
// 5. PROJECT DETAIL & DNA
// ==============================================
app.get('/projects/:id', login_required, (req, res) => {
  const p = db.projects.findById(req.params.id);
  if (!p) {
    flash(req, 'Project listing not found.', 'danger');
    return res.redirect('/projects');
  }

  const project = {
    ...p,
    primary_image: p.primary_image_url || '/static/uploads/e6e8a5047cda463394caae0579131f4e_20261031115646.jpg',
    creator: db.users.findById(p.creator_id) || { full_name: 'Community Maker', username: 'maker' }
  };

  const current_user = res.locals.current_user;
  const is_bookmarked = current_user ? db.bookmarks.isBookmarked(current_user.id, project.id) : false;
  const updates = db.projectUpdates.forProject(project.id);
  const adoption_requests = db.adoptions.forProject(project.id);

  // Related projects in same category
  const related_projects = db.projects.filter(r => r.category === project.category && r.id !== project.id).slice(0, 3).map(r => ({
    ...r,
    primary_image: r.primary_image_url || '/static/uploads/e6e8a5047cda463394caae0579131f4e_20261031115646.jpg'
  }));

  res.render('project_detail.html', {
    project,
    is_bookmarked,
    updates,
    adoption_requests,
    related_projects
  });
});

// ==============================================
// 6. CREATE PROJECT
// ==============================================
app.get('/projects/new', login_required, (req, res) => {
  res.render('create_project.html');
});

app.post('/projects/new', login_required, upload.single('primary_image_file'), (req, res) => {
  const user = res.locals.current_user;
  const {
    title,
    category,
    completion_percentage,
    preferred_transfer_type,
    short_description,
    full_description,
    original_idea,
    work_completed_details,
    why_abandoned,
    what_is_needed,
    tools_materials_included,
    skills_required,
    image_url_fallback
  } = req.body;

  let imageUrl = '/static/uploads/e6e8a5047cda463394caae0579131f4e_20261031115646.jpg';
  if (req.file) {
    imageUrl = `/static/uploads/${req.file.filename}`;
  } else if (image_url_fallback && image_url_fallback.trim()) {
    imageUrl = image_url_fallback.trim();
  }

  const newProj = db.projects.create({
    title: title.trim(),
    category: category || 'Handmade & Crafts',
    completion_percentage: parseInt(completion_percentage || '30', 10),
    preferred_transfer_type: preferred_transfer_type || 'Adopt my project',
    short_description: short_description || title,
    full_description: full_description || short_description || title,
    original_idea: original_idea || '',
    work_completed_details: work_completed_details || '',
    why_abandoned: why_abandoned || '',
    what_is_needed: what_is_needed || '',
    tools_materials_included: tools_materials_included || '',
    skills_required: skills_required || '',
    primary_image_url: imageUrl,
    creator_id: user.id,
    status: 'Available for Adoption'
  });

  flash(req, 'Your paused project has been shared with reverence to the community!', 'success');
  res.redirect(`/projects/${newProj.id}`);
});

// ==============================================
// 7. BOOKMARK & LIKE ACTIONS (AJAX)
// ==============================================
app.post('/projects/:id/bookmark', login_required, (req, res) => {
  const user = res.locals.current_user;
  const bookmarked = db.bookmarks.toggle(user.id, req.params.id);
  res.json({ success: true, bookmarked });
});

app.post('/projects/:id/like', login_required, (req, res) => {
  const p = db.projects.findById(req.params.id);
  if (!p) return res.status(404).json({ success: false });
  p.likes_count = (p.likes_count || 0) + 1;
  db.projects.update(p.id, { likes_count: p.likes_count });
  res.json({ success: true, likes_count: p.likes_count });
});

// ==============================================
// 8. ADOPTION WORKFLOW
// ==============================================
app.post('/projects/:id/adopt', login_required, (req, res) => {
  const user = res.locals.current_user;
  const project = db.projects.findById(req.params.id);
  if (!project) return res.status(404).send('Project not found');

  const { proposal_text, intended_timeline, maker_experience, tools_available, shipping_preference, shipping_address } = req.body;
  
  db.adoptions.create({
    project_id: project.id,
    applicant_id: user.id,
    proposal_text: proposal_text || '',
    intended_timeline: intended_timeline || '1-3 months',
    maker_experience: maker_experience || '',
    tools_available: tools_available || '',
    shipping_preference: shipping_preference || 'Standard Ground',
    shipping_address: shipping_address || '',
    status: 'Pending Review'
  });

  // Notify project creator
  db.notifications.create({
    user_id: project.creator_id,
    title: 'New Adoption Proposal',
    message: `${user.full_name || user.username} submitted an adoption proposal for "${project.title}".`,
    link: `/adoptions`,
    notification_type: 'adoption'
  });

  flash(req, 'Your adoption proposal has been delivered to the original creator with care.', 'success');
  res.redirect(`/projects/${project.id}`);
});

app.get('/adoptions', login_required, (req, res) => {
  const user = res.locals.current_user;
  
  // Proposals user submitted
  const sent_requests = db.adoptions.forApplicant(user.id).map(r => ({
    ...r,
    project: db.projects.findById(r.project_id) || { title: 'Craft Project' },
    owner: db.users.findById((db.projects.findById(r.project_id) || {}).creator_id) || { email: 'maker@unclaimedproject.org' }
  }));

  // Proposals received for user's projects
  const myProjectIds = db.projects.filter(p => Number(p.creator_id) === Number(user.id)).map(p => p.id);
  const received_requests = db.adoptions.all().filter(r => myProjectIds.includes(Number(r.project_id))).map(r => ({
    ...r,
    project: db.projects.findById(r.project_id) || { title: 'Craft Project' },
    applicant: db.users.findById(r.applicant_id) || { full_name: 'Artisan Maker', username: 'maker' }
  }));

  res.render('adoptions.html', {
    sent_requests,
    received_requests
  });
});

app.post('/adoptions/:id/action', login_required, (req, res) => {
  const { action } = req.body; // 'approve' or 'decline'
  const newStatus = action === 'approve' ? 'Approved' : 'Declined';
  const adoption = db.adoptions.update(req.params.id, { status: newStatus });

  if (adoption) {
    if (newStatus === 'Approved') {
      db.projects.update(adoption.project_id, { status: 'Adopted' });
    }
    db.notifications.create({
      user_id: adoption.applicant_id,
      title: `Adoption Proposal ${newStatus}`,
      message: `Your adoption proposal was ${newStatus.toLowerCase()} by the creator.`,
      link: '/adoptions',
      notification_type: 'adoption'
    });
    flash(req, `Adoption request ${newStatus.toLowerCase()}.`, 'success');
  }

  res.redirect('/adoptions');
});

app.post('/adoptions/:id/cancel', login_required, (req, res) => {
  db.adoptions.update(req.params.id, { status: 'Cancelled' });
  flash(req, 'Adoption proposal retracted.', 'info');
  res.redirect('/adoptions');
});

// ==============================================
// 9. COLLABORATIONS
// ==============================================
app.get('/collaborations', login_required, (req, res) => {
  const collaborations = db.projects.filter(p => p.status === 'Looking for Collaborator').map(p => ({
    id: p.id,
    project: {
      ...p,
      creator: db.users.findById(p.creator_id) || { full_name: 'Community Maker' }
    },
    title: p.title,
    role_title: 'Co-Creator / Specialist',
    description: p.what_is_needed || p.short_description,
    skills_needed: p.skills_required || 'Craft skills'
  }));

  res.render('collaboration.html', { collaborations });
});

app.post('/collaborations/:id/apply', login_required, (req, res) => {
  const user = res.locals.current_user;
  const project = db.projects.findById(req.params.id);
  const { proposed_role, message } = req.body;

  db.collaborations.createRequest({
    project_id: req.params.id,
    user_id: user.id,
    proposed_role: proposed_role || 'Co-Maker',
    message: message || ''
  });

  if (project) {
    db.notifications.create({
      user_id: project.creator_id,
      title: 'Collaboration Proposal',
      message: `${user.full_name} proposed collaborating on "${project.title}".`,
      link: `/projects/${project.id}`,
      notification_type: 'collaboration'
    });
  }

  flash(req, 'Your collaboration proposal has been sent to the creator!', 'success');
  res.redirect('/collaborations');
});

// ==============================================
// 10. SURPLUS MATERIALS
// ==============================================
app.get('/materials', login_required, (req, res) => {
  const category = req.query.category;
  let materials = db.materials.all().map(m => ({
    ...m,
    user: db.users.findById(m.user_id) || { full_name: 'Generous Maker' }
  }));

  if (category && category !== 'All Categories') {
    materials = materials.filter(m => m.category && m.category.toLowerCase() === category.toLowerCase());
  }

  res.render('materials.html', {
    materials,
    active_category: category || 'All Categories'
  });
});

app.post('/materials', login_required, upload.single('image_file'), (req, res) => {
  const user = res.locals.current_user;
  const { title, category, quantity, condition, location, shipping_available, description, image_url_fallback } = req.body;

  let imageUrl = 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=600&q=80';
  if (req.file) {
    imageUrl = `/static/uploads/${req.file.filename}`;
  } else if (image_url_fallback && image_url_fallback.trim()) {
    imageUrl = image_url_fallback.trim();
  }

  db.materials.create({
    title: title.trim(),
    category: category || 'Craft Supplies',
    quantity: quantity || '1 bundle',
    condition: condition || 'New / Unused',
    location: location || user.location || 'Local pickup or ship',
    shipping_available: Boolean(shipping_available),
    description: description || '',
    image_url: imageUrl,
    user_id: user.id,
    status: 'Available'
  });

  flash(req, 'Surplus materials cataloged! Thank you for reducing workshop waste.', 'success');
  res.redirect('/materials');
});

app.post('/materials/:id/claim', login_required, (req, res) => {
  const user = res.locals.current_user;
  const mat = db.materials.findById(req.params.id);
  if (mat) {
    db.materials.update(mat.id, { is_claimed: true, status: 'Claimed' });
    db.notifications.create({
      user_id: mat.user_id,
      title: 'Material Claimed',
      message: `${user.full_name} claimed your surplus listing "${mat.title}".`,
      link: '/materials',
      notification_type: 'material'
    });
    flash(req, 'You claimed this material! The listing owner has been notified.', 'success');
  }
  res.redirect('/materials');
});

// ==============================================
// 11. BEFORE & AFTER GALLERY
// ==============================================
app.get('/gallery', login_required, (req, res) => {
  const showcases = db.stories.all();
  res.render('gallery.html', { showcases });
});

app.post('/gallery/submit', login_required, upload.fields([
  { name: 'image_before', maxCount: 1 },
  { name: 'image_after', maxCount: 1 }
]), (req, res) => {
  const { project_title, original_creator_name, story_text, reflection_quote, category } = req.body;
  const beforeUrl = req.files && req.files['image_before'] ? `/static/uploads/${req.files['image_before'][0].filename}` : 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=600&q=80';
  const afterUrl = req.files && req.files['image_after'] ? `/static/uploads/${req.files['image_after'][0].filename}` : 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=600&q=80';

  db.stories.create({
    project_title,
    original_creator_name: original_creator_name || 'Anonymous Maker',
    adopted_maker_name: res.locals.current_user.full_name,
    story_text,
    reflection_quote,
    category: category || 'Restoration',
    image_before: beforeUrl,
    image_after: afterUrl,
    completed_date: new Date().toISOString()
  });

  flash(req, 'Before & After transformation added to our permanent archives!', 'success');
  res.redirect('/gallery');
});

// ==============================================
// 12. PROJECT STORIES
// ==============================================
app.get('/stories', login_required, (req, res) => {
  const stories = db.stories.all();
  res.render('stories.html', { stories });
});

app.post('/stories', login_required, (req, res) => {
  const { project_title, story_text, reflection_quote, category } = req.body;
  db.stories.create({
    project_title,
    original_creator_name: res.locals.current_user.full_name,
    adopted_maker_name: 'Community Hand',
    story_text,
    reflection_quote,
    category: category || 'Craft Journey',
    completed_date: new Date().toISOString()
  });
  flash(req, 'Thank you for sharing your creative story with our community.', 'success');
  res.redirect('/stories');
});

// ==============================================
// 13. USER PROFILES
// ==============================================
app.get('/profile', login_required, (req, res) => {
  res.redirect(`/profile/${res.locals.current_user.id}`);
});

app.get('/profile/:id', login_required, (req, res) => {
  const user = db.users.findById(req.params.id);
  if (!user) {
    flash(req, 'Maker profile not found.', 'danger');
    return res.redirect('/');
  }

  const active_projects = db.projects.filter(p => Number(p.creator_id) === Number(user.id)).map(p => ({
    ...p,
    primary_image: p.primary_image_url || '/static/uploads/e6e8a5047cda463394caae0579131f4e_20261031115646.jpg'
  }));

  const myApprovedAdoptions = db.adoptions.forApplicant(user.id).filter(a => a.status === 'Approved');
  const rescuedProjectIds = myApprovedAdoptions.map(a => a.project_id);
  const rescued_projects = db.projects.filter(p => rescuedProjectIds.includes(Number(p.id))).map(p => ({
    ...p,
    primary_image: p.primary_image_url || '/static/uploads/e6e8a5047cda463394caae0579131f4e_20261031115646.jpg'
  }));

  res.render('profile.html', {
    user,
    active_projects,
    rescued_projects
  });
});

app.get('/profile/edit', login_required, (req, res) => {
  res.render('profile_edit.html', { user: res.locals.current_user });
});

app.post('/profile/edit', login_required, upload.single('avatar_file'), (req, res) => {
  const user = res.locals.current_user;
  const { full_name, bio, craft_specialty, location, website } = req.body;
  
  const updates = {
    full_name: full_name ? full_name.trim() : user.full_name,
    bio: bio || user.bio,
    craft_specialty: craft_specialty || user.craft_specialty,
    location: location || user.location,
    website: website || user.website
  };

  if (req.file) {
    updates.avatar_url = `/static/uploads/${req.file.filename}`;
  }

  db.users.update(user.id, updates);
  flash(req, 'Studio profile updated successfully!', 'success');
  res.redirect(`/profile/${user.id}`);
});

// ==============================================
// 14. NOTIFICATIONS
// ==============================================
app.get('/notifications', login_required, (req, res) => {
  const user = res.locals.current_user;
  const notifications = db.notifications.forUser(user.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.render('notifications.html', { notifications });
});

app.post('/notifications/read-all', login_required, (req, res) => {
  db.notifications.markAllRead(res.locals.current_user.id);
  flash(req, 'All notifications marked as read.', 'info');
  res.redirect('/notifications');
});

app.post('/notifications/:id/read', login_required, (req, res) => {
  const notifs = db.notifications.forUser(res.locals.current_user.id);
  const n = notifs.find(item => Number(item.id) === Number(req.params.id));
  if (n) {
    n.is_read = true;
    db.save();
  }
  res.json({ success: true });
});

// ==============================================
// 15. REVIEWS, REPORTS, GUIDELINES & HEALTH
// ==============================================
app.post('/projects/:id/review', login_required, (req, res) => {
  const { rating, comment } = req.body;
  const project = db.projects.findById(req.params.id);
  if (project) {
    db.reviews.create({
      project_id: project.id,
      reviewer_id: res.locals.current_user.id,
      reviewee_id: project.creator_id,
      rating: parseInt(rating || '5', 10),
      comment: comment || ''
    });
    flash(req, 'Thank you for your generous maker review.', 'success');
  }
  res.redirect(`/projects/${req.params.id}`);
});

app.post('/projects/:id/report', login_required, (req, res) => {
  const { reason, details } = req.body;
  db.reports.create({
    project_id: req.params.id,
    reporter_id: res.locals.current_user.id,
    reason: reason || 'Listing guidelines inquiry',
    details: details || ''
  });
  flash(req, 'Thank you for keeping our community safe. Our team will review this listing.', 'info');
  res.redirect(`/projects/${req.params.id}`);
});

app.get('/guidelines', (req, res) => {
  res.render('guidelines.html');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Start listening on port 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`The Unclaimed Project server running on http://0.0.0.0:${PORT}`);
});
