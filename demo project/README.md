# The Unclaimed Project 🌱
> *"Give unfinished ideas a second life."*

A modern, minimal, warm, and humanized creative community platform where makers share abandoned or unfinished projects so others can adopt them, collaborate, or give surplus materials a meaningful second life.

---

## 🎨 Design Philosophy & Aesthetic

- **Warm, Creative & Welcoming**: Handcrafted aesthetic with plenty of whitespace, subtle shadows, and soft hover interactions.
- **Humanized, Non-Corporate Tone**: Free of generic AI templates or complex admin dashboards. Scrapbook-inspired editorial stories and respectful adoption language.
- **Carefully Curated Color Palette**:
  - **Warm Ivory** (`#F8F5EF`): Main canvas and soothing background
  - **Sage Green** (`#A3B18A`): Soft organic badges and progress indicators
  - **Deep Olive** (`#465443`): Primary typography and anchor buttons
  - **Terracotta** (`#C77B5B`): Calls to action, heart reactions, and badges
  - **Dusty Peach** (`#EBC8B5`): Delicate washi tape accents and tags
  - **Soft Brown** (`#806B5A`): Muted storytelling text and metadata

---

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+), Bootstrap 5.3, Bootstrap Icons, Google Fonts (`Fraunces` + `Plus Jakarta Sans`).
- **Backend**: Python 3 with Flask & Jinja2 templates.
- **Database**: PostgreSQL support with SQLAlchemy (defaults gracefully to SQLite for instant local zero-config testing if `DATABASE_URL` is omitted).
- **Security**: Password hashing via `werkzeug.security`.

---

## 📂 Project Architecture

```
demo project/
│
├── app.py                     # Flask application entry point, routing, API endpoints
├── models.py                  # SQLAlchemy models (User, Project, AdoptionRequest, MaterialItem, Story, Review, Report)
├── database.py                # Database engine setup (PostgreSQL / SQLite compatibility)
├── seed_data.py               # Heartwarming seed data across all 7 craft categories
├── requirements.txt           # Python dependencies
├── README.md                  # Documentation
│
├── static/
│   ├── css/
│   │   └── style.css          # Design system, palette tokens, typography, washi-tape scrapbook cards
│   └── js/
│       └── main.js            # AJAX like button, split view comparison, live photo preview
│
└── templates/
    ├── base.html              # Base layout with warm navigation, flash alerts, and community footer
    ├── index.html             # Landing page with hero collage, impact counters, how-it-works, scrapbook story
    ├── login.html             # Login page with 1-click test credentials
    ├── register.html          # Registration form
    ├── dashboard.html         # User studio dashboard (my projects, adoptions, materials, requests)
    ├── explore.html           # Project discovery with live search, category pills & status filters
    ├── project_detail.html    # Project detail with adoption request modal, progress bar, reviews & reports
    ├── create_project.html    # Project creation form with photo presets and completion percentage slider
    ├── adoptions.html         # Inbound & outbound adoption request tracker
    ├── collaboration.html     # Maker collaboration board
    ├── materials.html         # Surplus material sharing exchange
    ├── gallery.html           # Side-by-side Before & After transformation gallery
    ├── stories.html           # Scrapbook editorial storytelling
    ├── profile.html           # Public maker profile with badges and portfolio
    └── guidelines.html        # Community guidelines, zero-waste code & FAQs
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Python 3.10+
- `pip`

### 2. Installation
```bash
python -m pip install -r requirements.txt
```

### 3. Database Configuration
By default, the application runs immediately with SQLite (`unclaimed_project.db`).
To connect to your **PostgreSQL** instance:
```bash
# Windows PowerShell
$env:DATABASE_URL="postgresql://username:password@localhost:5432/unclaimed_db"

# Linux / macOS
export DATABASE_URL="postgresql://username:password@localhost:5432/unclaimed_db"
```

### 4. Running the Application
```bash
python app.py
```
Open your browser and navigate to **`http://localhost:5000`**.

---

## 🌿 Demonstration Accounts (1-Click Ready)

For instant exploration without manual signup:
- **Maya Chen** (`maya_textiles`): Textiles, embroidery & natural dye enthusiast
- **Elena Rostova** (`elena_wood`): Restorer of salvaged timber & mid-century furniture
- **Samir Patel** (`sam_maker`): Open-hardware hacker & analog synthesizer builder
- **Clara Beauchamp** (`clara_botanical`): Botanical watercolorist & urban gardener

*(Password for all demo accounts: `password123` or use the 1-click login buttons on `/login`)*
