import os
import uuid
from functools import wraps
from datetime import datetime
from PIL import Image

from flask import (
    Flask, render_template, request, redirect, url_for, 
    flash, session, jsonify, abort
)
from werkzeug.utils import secure_filename
from database import db_session, init_db
from models import (
    User, Project, AdoptionRequest, Collaboration, CollaborationRequest,
    MaterialItem, ProjectStory, Review, Report, Bookmark, Notification, ProjectUpdate
)
from seed_data import seed_database

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "unclaimed-project-warm-secret-key-2026")

UPLOAD_FOLDER = os.path.join(app.root_path, 'static', 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max upload

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def process_and_save_image(file_obj, max_dimension=1600):
    """Process uploaded image using Pillow for optimization and resizing."""
    if not file_obj or not file_obj.filename or not allowed_file(file_obj.filename):
        return None
    
    filename = secure_filename(file_obj.filename)
    extension = filename.rsplit('.', 1)[1].lower()
    unique_filename = f"{uuid.uuid4().hex}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.{extension}"
    save_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)

    try:
        image = Image.open(file_obj)
        # Convert RGBA to RGB if saving as JPEG
        if image.mode in ("RGBA", "P") and extension in ('jpg', 'jpeg'):
            image = image.convert("RGB")
        
        # Resize if larger than max_dimension
        image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
        image.save(save_path, optimize=True, quality=85)
        return f"/static/uploads/{unique_filename}"
    except Exception as e:
        print(f"Error processing image with Pillow: {e}")
        return None

# Database session teardown
@app.teardown_appcontext
def shutdown_session(exception=None):
    db_session.remove()

# Initialize & seed database automatically
with app.app_context():
    seed_database()

# Context processor for global variables and notifications
@app.context_processor
def inject_globals():
    current_user = None
    unread_notifications = 0
    show_welcome_popup = False
    if "user_id" in session:
        current_user = db_session.get(User, session["user_id"])
        if current_user:
            unread_notifications = current_user.unread_notifications_count()
        show_welcome_popup = session.pop("show_welcome_popup", False)
    
    categories = [
        "Art & Painting",
        "Fashion & DIY",
        "Programming & Technology",
        "Photography",
        "Gardening",
        "Handmade & Crafts",
        "Academic Projects",
        "Other"
    ]
    return dict(
        current_user=current_user, 
        all_categories=categories,
        unread_notifications=unread_notifications,
        show_welcome_popup=show_welcome_popup
    )

def create_notification(user_id, title, message, link=None, notif_type="general"):
    """Helper to dispatch in-app notifications."""
    try:
        notif = Notification(
            user_id=user_id,
            title=title,
            message=message,
            link=link,
            notification_type=notif_type
        )
        db_session.add(notif)
        db_session.commit()
    except Exception as e:
        db_session.rollback()
        print(f"Failed to create notification: {e}")

# Authentication decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            flash("Please sign in or create an account to view and participate in this project.", "warning")
            return redirect(url_for("login", next=request.url))
        return f(*args, **kwargs)
    return decorated_function

# Cache-Control to prevent back-button viewing of protected pages after logout
@app.after_request
def add_header(response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# -------------------------------------------------------------
# 1. LANDING PAGE
# -------------------------------------------------------------
@app.route("/")
def index():
    # Dynamic calculations directly from database records (no permanent hardcoding)
    rescued_count = (
        db_session.query(Project).filter(Project.status == "Rescued / Completed").count() +
        db_session.query(AdoptionRequest).filter(AdoptionRequest.status == "Approved").count()
    )
    materials_count = (
        db_session.query(MaterialItem).count()
    )
    completed_count = (
        db_session.query(Project).filter(Project.completion_percentage == 100).count()
    )

    impact_stats = {
        "rescued_count": rescued_count,
        "materials_count": materials_count,
        "completed_count": completed_count
    }

    # Featured recent projects
    featured_projects = (
        db_session.query(Project)
        .filter(Project.status != "Rescued / Completed")
        .order_by(Project.created_at.desc())
        .limit(6)
        .all()
    )

    # Before & After sample projects for landing preview
    showcase_gallery = (
        db_session.query(Project)
        .filter(Project.before_image.isnot(None), Project.after_image.isnot(None))
        .limit(3)
        .all()
    )

    # Featured story for the scrapbook section
    featured_story = db_session.query(ProjectStory).order_by(ProjectStory.created_at.desc()).first()

    # Community reviews
    recent_reviews = db_session.query(Review).order_by(Review.created_at.desc()).limit(3).all()

    return render_template(
        "index.html",
        impact_stats=impact_stats,
        featured_projects=featured_projects,
        showcase_gallery=showcase_gallery,
        featured_story=featured_story,
        recent_reviews=recent_reviews
    )


# -------------------------------------------------------------
# 2. AUTHENTICATION & DEMO LOGIN
# -------------------------------------------------------------
@app.route("/login", methods=["GET", "POST"])
def login():
    if "user_id" in session:
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        login_identifier = request.form.get("login_identifier", "").strip()
        password = request.form.get("password", "")

        user = (
            db_session.query(User)
            .filter((User.username == login_identifier) | (User.email == login_identifier))
            .first()
        )

        if user and user.check_password(password):
            session["user_id"] = user.id
            session["username"] = user.username
            session["show_welcome_popup"] = True
            flash(f"Welcome back, {user.full_name or user.username}! Glad to see your creative hands again.", "success")
            next_url = request.args.get("next")
            return redirect(next_url or url_for("dashboard"))
        else:
            flash("Invalid email/username or password. Please try again.", "danger")

    demo_users = db_session.query(User).limit(4).all()
    return render_template("login.html", demo_users=demo_users)


@app.route("/demo-login/<username>")
def demo_login(username):
    user = db_session.query(User).filter(User.username == username).first()
    if user:
        session["user_id"] = user.id
        session["username"] = user.username
        session["show_welcome_popup"] = True
        flash(f"Signed in as demo maker: {user.full_name} ({user.craft_specialty})", "info")
    return redirect(url_for("dashboard"))


@app.route("/register", methods=["GET", "POST"])
def register():
    if "user_id" in session:
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        email = request.form.get("email", "").strip()
        full_name = request.form.get("full_name", "").strip()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")
        craft_specialty = request.form.get("craft_specialty", "").strip()
        location = request.form.get("location", "").strip()
        bio = request.form.get("bio", "").strip()

        if not username or not email or not password:
            flash("Username, email, and password are required.", "danger")
            return render_template("register.html")

        if confirm_password and password != confirm_password:
            flash("Passwords do not match. Please verify and try again.", "danger")
            return render_template("register.html")

        existing = db_session.query(User).filter((User.username == username) | (User.email == email)).first()
        if existing:
            flash("Username or email already exists. Please sign in or choose another.", "warning")
            return render_template("register.html")

        # Handle optional avatar upload
        avatar_file = request.files.get("avatar_file")
        avatar_url = process_and_save_image(avatar_file, max_dimension=400)
        if not avatar_url:
            avatar_url = f"https://api.dicebear.com/7.x/adventurer/svg?seed={username}&backgroundColor=ebc8b5,a3b18a"

        new_user = User(
            username=username,
            email=email,
            full_name=full_name or username,
            craft_specialty=craft_specialty or "Creative Explorer",
            location=location or "Everywhere",
            bio=bio or "Passionate about reviving unfinished dreams.",
            avatar_url=avatar_url
        )
        new_user.set_password(password)
        db_session.add(new_user)
        db_session.commit()

        session["user_id"] = new_user.id
        session["username"] = new_user.username
        session["show_welcome_popup"] = True
        
        # Send initial welcome notification
        create_notification(
            user_id=new_user.id,
            title="Welcome to The Unclaimed Project!",
            message="Thank you for joining our community of kind makers. Browse projects or share your first unfinished idea.",
            link="/explore",
            notif_type="system"
        )

        flash("Welcome to The Unclaimed Project! Your creative journey starts here.", "success")
        return redirect(url_for("dashboard"))

    return render_template("register.html")


@app.route("/logout")
def logout():
    session.clear()
    flash("You have been signed out. Thank you for caring for unfinished ideas.", "info")
    response = redirect(url_for("index"))
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# -------------------------------------------------------------
# 3. USER DASHBOARD ("YOUR CREATIVE FOOTPRINT")
# -------------------------------------------------------------
@app.route("/dashboard")
@login_required
def dashboard():
    user = db_session.get(User, session["user_id"])
    
    # My projects
    my_projects = db_session.query(Project).filter(Project.creator_id == user.id).order_by(Project.created_at.desc()).all()
    
    # Projects user has rescued or is adopting
    adopted_projects = db_session.query(Project).filter(Project.rescuer_id == user.id).all()
    
    # Ongoing collaborations (projects creator is collaborating on OR requested)
    my_collabs = db_session.query(Collaboration).join(Project).filter(Project.creator_id == user.id).all()
    joined_collabs = (
        db_session.query(CollaborationRequest)
        .filter(CollaborationRequest.applicant_id == user.id, CollaborationRequest.status == "Accepted")
        .all()
    )

    # Saved / Bookmarked projects
    saved_bookmarks = db_session.query(Bookmark).filter(Bookmark.user_id == user.id).all()

    # Materials listed
    my_materials = db_session.query(MaterialItem).filter(MaterialItem.donor_id == user.id).all()
    
    # Inbound & Outbound adoption requests
    inbound_requests = (
        db_session.query(AdoptionRequest)
        .filter(AdoptionRequest.owner_id == user.id)
        .order_by(AdoptionRequest.created_at.desc())
        .all()
    )
    outbound_requests = (
        db_session.query(AdoptionRequest)
        .filter(AdoptionRequest.applicant_id == user.id)
        .order_by(AdoptionRequest.created_at.desc())
        .all()
    )

    # Recent notifications
    recent_notifications = user.notifications[:5]

    # Creative footprint statistics
    footprint = {
        "helped_rescue": len(adopted_projects) + len(joined_collabs),
        "completed": sum(1 for p in my_projects if p.status == "Rescued / Completed") + sum(1 for p in adopted_projects if p.status == "Rescued / Completed"),
        "materials_contributed": len(my_materials)
    }

    # Community Creative Feed items for the logged-in dashboard homepage
    # 1. Recommended projects (matching user craft specialty or active projects, excluding own)
    rec_query = db_session.query(Project).filter(Project.creator_id != user.id, Project.status == "Available for Adoption")
    if user.craft_specialty:
        # Check partial match on craft specialty
        craft_terms = [t.strip() for t in user.craft_specialty.split('&')]
        filters = [Project.category.ilike(f"%{t}%") for t in craft_terms]
        from sqlalchemy import or_
        rec_projects = rec_query.filter(or_(*filters)).limit(3).all()
        if not rec_projects:
            rec_projects = rec_query.order_by(Project.likes_count.desc()).limit(3).all()
    else:
        rec_projects = rec_query.order_by(Project.likes_count.desc()).limit(3).all()

    # 2. Recently added community projects
    recent_community_projects = (
        db_session.query(Project)
        .filter(Project.creator_id != user.id)
        .order_by(Project.created_at.desc())
        .limit(4)
        .all()
    )

    # 3. Open collaboration calls
    open_collaborations = (
        db_session.query(Collaboration)
        .filter(Collaboration.status == "Open")
        .order_by(Collaboration.created_at.desc())
        .limit(3)
        .all()
    )

    # 4. Available materials
    available_materials = (
        db_session.query(MaterialItem)
        .filter(MaterialItem.is_claimed == False)
        .order_by(MaterialItem.created_at.desc())
        .limit(3)
        .all()
    )

    # 5. Global platform statistics for inspiration
    rescued_count = (
        db_session.query(Project).filter(Project.status == "Rescued / Completed").count() +
        db_session.query(AdoptionRequest).filter(AdoptionRequest.status == "Approved").count()
    )
    materials_count = db_session.query(MaterialItem).count()
    completed_count = db_session.query(Project).filter(Project.completion_percentage == 100).count()
    total_platform_stats = {
        "rescued_count": rescued_count,
        "materials_count": materials_count,
        "completed_count": completed_count
    }

    return render_template(
        "dashboard.html",
        user=user,
        my_projects=my_projects,
        adopted_projects=adopted_projects,
        my_collabs=my_collabs,
        joined_collabs=joined_collabs,
        saved_bookmarks=saved_bookmarks,
        my_materials=my_materials,
        inbound_requests=inbound_requests,
        outbound_requests=outbound_requests,
        recent_notifications=recent_notifications,
        footprint=footprint,
        recommended_projects=rec_projects,
        recent_community_projects=recent_community_projects,
        open_collaborations=open_collaborations,
        available_materials=available_materials,
        total_platform_stats=total_platform_stats
    )


# -------------------------------------------------------------
# 4. EXPLORE PROJECTS PAGE
# -------------------------------------------------------------
@app.route("/projects")
@login_required
def explore():
    category = request.args.get("category", "").strip()
    status = request.args.get("status", "").strip()
    search = request.args.get("search", "").strip()
    sort_by = request.args.get("sort", "newest")

    query = db_session.query(Project)

    if category and category != "All":
        query = query.filter(Project.category == category)

    if status and status != "All":
        query = query.filter(Project.status == status)

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            (Project.title.ilike(search_filter)) |
            (Project.short_description.ilike(search_filter)) |
            (Project.full_description.ilike(search_filter)) |
            (Project.skills_required.ilike(search_filter)) |
            (Project.materials_included.ilike(search_filter)) |
            (Project.location.ilike(search_filter))
        )

    if sort_by == "completion":
        query = query.order_by(Project.completion_percentage.desc())
    elif sort_by == "likes":
        query = query.order_by(Project.likes_count.desc())
    else:
        query = query.order_by(Project.created_at.desc())

    projects = query.all()

    return render_template(
        "explore.html",
        projects=projects,
        current_category=category,
        current_status=status,
        search_query=search,
        current_sort=sort_by,
        total_count=len(projects)
    )


# -------------------------------------------------------------
# 5. PROJECT DETAILS PAGE (WITH PROJECT DNA)
# -------------------------------------------------------------
@app.route("/projects/<int:project_id>")
@login_required
def project_detail(project_id):
    project = db_session.get(Project, project_id)
    if not project:
        abort(404)

    # Increment views
    project.views_count = (project.views_count or 0) + 1
    db_session.commit()

    # Similar projects in same category
    related_projects = (
        db_session.query(Project)
        .filter(Project.category == project.category, Project.id != project.id)
        .limit(3)
        .all()
    )

    # Check status for current user
    user_has_applied = False
    is_bookmarked = False
    if "user_id" in session:
        existing_req = (
            db_session.query(AdoptionRequest)
            .filter(
                AdoptionRequest.project_id == project.id,
                AdoptionRequest.applicant_id == session["user_id"],
                AdoptionRequest.status != "Cancelled"
            )
            .first()
        )
        if existing_req:
            user_has_applied = True

        existing_bm = (
            db_session.query(Bookmark)
            .filter(Bookmark.project_id == project.id, Bookmark.user_id == session["user_id"])
            .first()
        )
        if existing_bm:
            is_bookmarked = True

    return render_template(
        "project_detail.html",
        project=project,
        related_projects=related_projects,
        user_has_applied=user_has_applied,
        is_bookmarked=is_bookmarked
    )


# -------------------------------------------------------------
# 6. SHARE A PROJECT (WITH PILLOW UPLOADS & PROJECT DNA)
# -------------------------------------------------------------
@app.route("/projects/new", methods=["GET", "POST"])
@login_required
def create_project():
    if request.method == "POST":
        title = request.form.get("title", "").strip()
        category = request.form.get("category", "").strip()
        short_description = request.form.get("short_description", "").strip()
        full_description = request.form.get("full_description", "").strip()
        why_abandoned = request.form.get("why_abandoned", "").strip()
        what_is_needed = request.form.get("what_is_needed", "").strip()
        materials_included = request.form.get("materials_included", "").strip()
        skills_required = request.form.get("skills_required", "").strip()
        preferred_transfer_type = request.form.get("preferred_transfer_type", "Adopt my project")
        completion_percentage = int(request.form.get("completion_percentage", 50))
        status = request.form.get("status", "Available for Adoption")
        location = request.form.get("location", "").strip()
        estimated_time = request.form.get("estimated_time", "").strip()

        # PROJECT DNA fields
        original_idea = request.form.get("original_idea", "").strip()
        work_completed_details = request.form.get("work_completed_details", "").strip()
        remaining_work_details = request.form.get("remaining_work_details", "").strip()
        creator_message = request.form.get("creator_message", "").strip()

        # Handle image upload or image URL
        primary_image = None
        image_file = request.files.get("primary_image_file")
        if image_file and image_file.filename:
            primary_image = process_and_save_image(image_file)

        if not primary_image:
            primary_image = request.form.get("primary_image_url", "").strip()

        # Safe fallback
        if not primary_image:
            image_fallbacks = {
                "Art & Painting": "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=900&q=80",
                "Fashion & DIY": "https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=900&q=80",
                "Programming & Technology": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=900&q=80",
                "Photography": "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=900&q=80",
                "Gardening": "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=900&q=80",
                "Handmade & Crafts": "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=900&q=80",
                "Academic Projects": "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=900&q=80",
                "Other": "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=900&q=80"
            }
            primary_image = image_fallbacks.get(category, "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=900&q=80")

        new_project = Project(
            title=title,
            category=category,
            short_description=short_description,
            full_description=full_description,
            why_abandoned=why_abandoned,
            what_is_needed=what_is_needed,
            materials_included=materials_included,
            skills_required=skills_required,
            preferred_transfer_type=preferred_transfer_type,
            completion_percentage=completion_percentage,
            status=status,
            original_idea=original_idea,
            work_completed_details=work_completed_details,
            remaining_work_details=remaining_work_details,
            creator_message=creator_message,
            primary_image=primary_image,
            location=location,
            estimated_time_to_finish=estimated_time,
            creator_id=session["user_id"]
        )

        db_session.add(new_project)
        db_session.commit()

        flash(f"Your project '{title}' has been welcomed into our community!", "success")
        return redirect(url_for("project_detail", project_id=new_project.id))

    return render_template("create_project.html")


@app.route("/projects/<int:project_id>/bookmark", methods=["POST"])
@login_required
def toggle_bookmark(project_id):
    project = db_session.get(Project, project_id)
    if not project:
        return jsonify({"success": False, "error": "Not found"}), 404

    existing = (
        db_session.query(Bookmark)
        .filter(Bookmark.project_id == project.id, Bookmark.user_id == session["user_id"])
        .first()
    )

    if existing:
        db_session.delete(existing)
        db_session.commit()
        return jsonify({"success": True, "bookmarked": False, "message": "Removed from saved projects"})
    else:
        bm = Bookmark(user_id=session["user_id"], project_id=project.id)
        db_session.add(bm)
        db_session.commit()
        return jsonify({"success": True, "bookmarked": True, "message": "Saved to your studio scrapbook"})


@app.route("/projects/<int:project_id>/update", methods=["POST"])
@login_required
def add_project_update(project_id):
    project = db_session.get(Project, project_id)
    if not project:
        abort(404)

    # Creator or Rescuer can post updates
    if session["user_id"] != project.creator_id and session["user_id"] != project.rescuer_id:
        flash("Only the creator or assigned rescuer can post progress updates.", "danger")
        return redirect(url_for("project_detail", project_id=project.id))

    title = request.form.get("title", "").strip()
    content = request.form.get("content", "").strip()
    image_file = request.files.get("update_image_file")
    image_url = process_and_save_image(image_file)

    if not image_url:
        image_url = request.form.get("update_image_url", "").strip()

    if title and content:
        up = ProjectUpdate(
            project_id=project.id,
            author_id=session["user_id"],
            title=title,
            content=content,
            image_url=image_url
        )
        db_session.add(up)

        # Notify the other party
        target_user_id = project.creator_id if session["user_id"] == project.rescuer_id else project.rescuer_id
        if target_user_id:
            create_notification(
                user_id=target_user_id,
                title="Progress Update Posted",
                message=f"A new progress update '{title}' was posted on '{project.title}'.",
                link=f"/projects/{project.id}",
                notif_type="general"
            )

        db_session.commit()
        flash("Progress update published!", "success")

    return redirect(url_for("project_detail", project_id=project.id))


# -------------------------------------------------------------
# 7. ADOPTION REQUESTS WORKFLOW & DEDICATED PAGE
# -------------------------------------------------------------
@app.route("/projects/<int:project_id>/adopt", methods=["POST"])
@login_required
def submit_adoption_request(project_id):
    project = db_session.get(Project, project_id)
    if not project:
        abort(404)

    if project.creator_id == session["user_id"]:
        flash("You cannot adopt your own project listing.", "warning")
        return redirect(url_for("project_detail", project_id=project.id))

    message = request.form.get("message", "").strip()
    plan_to_complete = request.form.get("plan_to_complete", "").strip()

    if not message:
        flash("Please include a brief message explaining your vision.", "warning")
        return redirect(url_for("project_detail", project_id=project.id))

    req = AdoptionRequest(
        project_id=project.id,
        applicant_id=session["user_id"],
        owner_id=project.creator_id,
        message=message,
        plan_to_complete=plan_to_complete,
        status="Pending"
    )
    db_session.add(req)

    # Notify project owner
    applicant = db_session.get(User, session["user_id"])
    create_notification(
        user_id=project.creator_id,
        title="New Adoption Proposal Received",
        message=f"{applicant.full_name or applicant.username} sent an adoption proposal for '{project.title}'.",
        link="/adoptions",
        notif_type="adoption_request"
    )

    db_session.commit()
    flash("Your adoption request has been sent to the creator! They have been notified.", "success")
    return redirect(url_for("project_detail", project_id=project.id))


@app.route("/adoptions")
@login_required
def adoptions_page():
    user = db_session.get(User, session["user_id"])
    
    inbound_requests = (
        db_session.query(AdoptionRequest)
        .filter(AdoptionRequest.owner_id == user.id)
        .order_by(AdoptionRequest.created_at.desc())
        .all()
    )

    outbound_requests = (
        db_session.query(AdoptionRequest)
        .filter(AdoptionRequest.applicant_id == user.id)
        .order_by(AdoptionRequest.created_at.desc())
        .all()
    )

    return render_template(
        "adoptions.html",
        inbound_requests=inbound_requests,
        outbound_requests=outbound_requests
    )


@app.route("/adoptions/<int:request_id>/action", methods=["POST"])
@login_required
def handle_adoption_action(request_id):
    req = db_session.get(AdoptionRequest, request_id)
    if not req or req.owner_id != session["user_id"]:
        flash("Unauthorized action.", "danger")
        return redirect(url_for("adoptions_page"))

    action = request.form.get("action")
    if action == "approve":
        req.status = "Approved"
        project = req.project
        project.rescuer_id = req.applicant_id
        project.status = "In Collaboration"

        create_notification(
            user_id=req.applicant_id,
            title="Adoption Proposal Approved! 🎉",
            message=f"Great news! Your proposal to adopt '{project.title}' was approved by {req.owner.full_name}. Connect to arrange handover.",
            link=f"/projects/{project.id}",
            notif_type="adoption_decision"
        )
        flash(f"You approved {req.applicant.full_name}'s adoption request for '{project.title}'! You are now connected.", "success")

    elif action == "decline":
        req.status = "Declined"
        create_notification(
            user_id=req.applicant_id,
            title="Adoption Proposal Update",
            message=f"The maker has chosen another direction for '{req.project.title}'. Thank you for your kind offer.",
            link="/explore",
            notif_type="adoption_decision"
        )
        flash("Adoption request has been gracefully declined.", "info")

    db_session.commit()
    return redirect(request.referrer or url_for("adoptions_page"))


@app.route("/adoptions/<int:request_id>/cancel", methods=["POST"])
@login_required
def cancel_adoption_request(request_id):
    req = db_session.get(AdoptionRequest, request_id)
    if not req or req.applicant_id != session["user_id"]:
        flash("Unauthorized action.", "danger")
        return redirect(url_for("adoptions_page"))

    req.status = "Cancelled"
    db_session.commit()
    flash("Your adoption proposal has been cancelled.", "info")
    return redirect(url_for("adoptions_page"))


# -------------------------------------------------------------
# 8. COLLABORATION PAGE & REQUESTS
# -------------------------------------------------------------
@app.route("/collaborations", methods=["GET", "POST"])
@login_required
def collaborations():
    if request.method == "POST":
        project_id = int(request.form.get("project_id"))
        role_title = request.form.get("role_title", "").strip()
        skills_needed = request.form.get("skills_needed", "").strip()
        description = request.form.get("description", "").strip()

        collab = Collaboration(
            project_id=project_id,
            role_title=role_title,
            skills_needed=skills_needed,
            description=description,
            status="Open"
        )
        db_session.add(collab)
        db_session.commit()
        flash("Collaboration opportunity posted! Fellow makers will now see your call.", "success")
        return redirect(url_for("collaborations"))

    collabs = db_session.query(Collaboration).order_by(Collaboration.created_at.desc()).all()
    
    user_projects = []
    if "user_id" in session:
        user_projects = db_session.query(Project).filter(Project.creator_id == session["user_id"]).all()

    return render_template("collaboration.html", collabs=collabs, user_projects=user_projects)


@app.route("/collaborations/<int:collab_id>/apply", methods=["POST"])
@login_required
def apply_to_collaboration(collab_id):
    collab = db_session.get(Collaboration, collab_id)
    if not collab:
        abort(404)

    if collab.project.creator_id == session["user_id"]:
        flash("You cannot apply to your own collaboration listing.", "warning")
        return redirect(url_for("collaborations"))

    message = request.form.get("message", "").strip()
    skills_offered = request.form.get("skills_offered", "").strip()

    req = CollaborationRequest(
        collaboration_id=collab.id,
        project_id=collab.project_id,
        applicant_id=session["user_id"],
        message=message,
        skills_offered=skills_offered,
        status="Pending"
    )
    db_session.add(req)

    # Notify project creator
    applicant = db_session.get(User, session["user_id"])
    create_notification(
        user_id=collab.project.creator_id,
        title="Collaboration Proposal Received",
        message=f"{applicant.full_name} applied to collaborate as '{collab.role_title}'.",
        link="/dashboard",
        notif_type="collaboration"
    )

    db_session.commit()
    flash("Your collaboration proposal was sent to the project owner!", "success")
    return redirect(url_for("collaborations"))


# -------------------------------------------------------------
# 9. MATERIAL SHARING PAGE
# -------------------------------------------------------------
@app.route("/materials", methods=["GET", "POST"])
@login_required
def materials():
    if request.method == "POST":
        title = request.form.get("title", "").strip()
        category = request.form.get("category", "").strip()
        description = request.form.get("description", "").strip()
        quantity = request.form.get("quantity", "").strip()
        condition = request.form.get("condition", "Gently Used").strip()
        location = request.form.get("location", "").strip()
        
        # Handle file upload or image URL
        image_file = request.files.get("material_image_file")
        image_url = process_and_save_image(image_file)
        if not image_url:
            image_url = request.form.get("image_url", "").strip()
        if not image_url:
            image_url = "https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=600&q=80"

        material = MaterialItem(
            title=title,
            category=category,
            description=description,
            quantity=quantity,
            condition=condition,
            location=location,
            image_url=image_url,
            donor_id=session["user_id"]
        )
        db_session.add(material)
        db_session.commit()

        flash("Your surplus materials have been listed! Thank you for preventing waste.", "success")
        return redirect(url_for("materials"))

    filter_cat = request.args.get("category", "")
    search_q = request.args.get("search", "")
    query = db_session.query(MaterialItem).order_by(MaterialItem.created_at.desc())
    
    if filter_cat:
        query = query.filter(MaterialItem.category == filter_cat)
    if search_q:
        query = query.filter(
            (MaterialItem.title.ilike(f"%{search_q}%")) |
            (MaterialItem.description.ilike(f"%{search_q}%")) |
            (MaterialItem.location.ilike(f"%{search_q}%"))
        )
    
    all_materials = query.all()
    return render_template("materials.html", materials=all_materials, current_category=filter_cat, search_query=search_q)


@app.route("/materials/<int:material_id>/claim", methods=["POST"])
@login_required
def claim_material(material_id):
    item = db_session.get(MaterialItem, material_id)
    if not item:
        abort(404)

    item.is_claimed = True
    item.claimed_by_user_id = session["user_id"]

    claimer = db_session.get(User, session["user_id"])
    create_notification(
        user_id=item.donor_id,
        title="Material Claimed! 📦",
        message=f"{claimer.full_name} claimed your listed material '{item.title}'. Connect with them at {claimer.email}.",
        link="/dashboard",
        notif_type="general"
    )

    db_session.commit()
    flash(f"You claimed '{item.title}'! We have notified donor {item.donor.full_name}.", "success")
    return redirect(url_for("materials"))


# -------------------------------------------------------------
# 10. BEFORE & AFTER GALLERY & SUBMISSION
# -------------------------------------------------------------
@app.route("/gallery")
@login_required
def gallery():
    category = request.args.get("category", "")
    query = db_session.query(Project).filter(
        Project.before_image.isnot(None),
        Project.after_image.isnot(None)
    )
    if category:
        query = query.filter(Project.category == category)

    gallery_projects = query.order_by(Project.updated_at.desc()).all()
    
    # User eligible projects for submission
    user_eligible_projects = (
        db_session.query(Project)
        .filter((Project.creator_id == session["user_id"]) | (Project.rescuer_id == session["user_id"]))
        .all()
    )

    return render_template(
        "gallery.html", 
        projects=gallery_projects, 
        selected_category=category,
        user_eligible_projects=user_eligible_projects
    )


@app.route("/gallery/submit", methods=["POST"])
@login_required
def submit_before_after():
    project_id = int(request.form.get("project_id"))
    transformation_story = request.form.get("transformation_story", "").strip()

    project = db_session.get(Project, project_id)
    if not project or (project.creator_id != session["user_id"] and project.rescuer_id != session["user_id"]):
        flash("Unauthorized action.", "danger")
        return redirect(url_for("gallery"))

    # Process files
    before_file = request.files.get("before_image_file")
    after_file = request.files.get("after_image_file")
    
    before_url = process_and_save_image(before_file) or request.form.get("before_image_url", "").strip() or project.primary_image
    after_url = process_and_save_image(after_file) or request.form.get("after_image_url", "").strip()

    if after_url:
        project.before_image = before_url
        project.after_image = after_url
        project.transformation_story = transformation_story
        project.status = "Rescued / Completed"
        project.completion_percentage = 100
        db_session.commit()
        flash("Your transformation story has been added to the Before & After gallery!", "success")
    else:
        flash("Please provide a completed after photograph.", "warning")

    return redirect(url_for("gallery"))


# -------------------------------------------------------------
# 11. PROJECT STORIES PAGE & SUBMISSION
# -------------------------------------------------------------
@app.route("/stories", methods=["GET", "POST"])
@login_required
def stories():
    if request.method == "POST":
        title = request.form.get("title", "").strip()
        excerpt = request.form.get("excerpt", "").strip()
        full_story = request.form.get("full_story", "").strip()
        original_creator_name = request.form.get("original_creator_name", "").strip()
        rescuer_name = request.form.get("rescuer_name", "").strip()
        category = request.form.get("category", "").strip()
        quote = request.form.get("quote", "").strip()

        story_image_file = request.files.get("story_image_file")
        image_url = process_and_save_image(story_image_file) or request.form.get("image_url", "").strip()
        if not image_url:
            image_url = "https://images.unsplash.com/photo-1528458909336-e7a0adfed0a5?auto=format&fit=crop&w=900&q=80"

        story = ProjectStory(
            title=title,
            excerpt=excerpt,
            full_story=full_story,
            original_creator_name=original_creator_name,
            rescuer_name=rescuer_name,
            category=category,
            quote=quote,
            image_url=image_url
        )
        db_session.add(story)
        db_session.commit()
        flash("Your project story has been published to the community scrapbook!", "success")
        return redirect(url_for("stories"))

    all_stories = db_session.query(ProjectStory).order_by(ProjectStory.created_at.desc()).all()
    return render_template("stories.html", stories=all_stories)


# -------------------------------------------------------------
# 12. USER PROFILE & PROFILE EDITING
# -------------------------------------------------------------
@app.route("/profile")
@login_required
def my_profile():
    return redirect(url_for("user_profile", user_id=session["user_id"]))


@app.route("/profile/<int:user_id>")
@login_required
def user_profile(user_id):
    user = db_session.get(User, user_id)
    if not user:
        abort(404)

    active_projects = db_session.query(Project).filter(Project.creator_id == user.id).all()
    rescued_projects = db_session.query(Project).filter(Project.rescuer_id == user.id).all()
    donated_materials = db_session.query(MaterialItem).filter(MaterialItem.donor_id == user.id).all()

    return render_template(
        "profile.html",
        profile_user=user,
        active_projects=active_projects,
        rescued_projects=rescued_projects,
        donated_materials=donated_materials
    )


@app.route("/profile/edit", methods=["GET", "POST"])
@login_required
def edit_profile():
    user = db_session.get(User, session["user_id"])

    if request.method == "POST":
        user.full_name = request.form.get("full_name", "").strip() or user.username
        user.craft_specialty = request.form.get("craft_specialty", "").strip()
        user.location = request.form.get("location", "").strip()
        user.website = request.form.get("website", "").strip()
        user.bio = request.form.get("bio", "").strip()

        # Handle avatar file upload
        avatar_file = request.files.get("avatar_file")
        if avatar_file and avatar_file.filename:
            avatar_url = process_and_save_image(avatar_file, max_dimension=400)
            if avatar_url:
                user.avatar_url = avatar_url
        elif request.form.get("avatar_url"):
            user.avatar_url = request.form.get("avatar_url").strip()

        db_session.commit()
        flash("Your maker profile has been updated!", "success")
        return redirect(url_for("user_profile", user_id=user.id))

    return render_template("profile_edit.html", user=user)


# -------------------------------------------------------------
# 13. NOTIFICATIONS SYSTEM
# -------------------------------------------------------------
@app.route("/notifications")
@login_required
def notifications():
    user = db_session.get(User, session["user_id"])
    all_notifs = user.notifications
    return render_template("notifications.html", notifications=all_notifs)


@app.route("/notifications/read-all", methods=["POST"])
@login_required
def mark_all_notifications_read():
    user = db_session.get(User, session["user_id"])
    for n in user.notifications:
        n.is_read = True
    db_session.commit()
    flash("All notifications marked as read.", "info")
    return redirect(url_for("notifications"))


@app.route("/notifications/<int:notif_id>/read", methods=["POST"])
@login_required
def mark_notification_read(notif_id):
    notif = db_session.get(Notification, notif_id)
    if notif and notif.user_id == session["user_id"]:
        notif.is_read = True
        db_session.commit()
        return jsonify({"success": True})
    return jsonify({"success": False}), 404


# -------------------------------------------------------------
# 14. COMMUNITY INTERACTIONS (REVIEWS, LIKES, REPORTS)
# -------------------------------------------------------------
@app.route("/projects/<int:project_id>/review", methods=["POST"])
@login_required
def add_review(project_id):
    project = db_session.get(Project, project_id)
    if not project:
        abort(404)

    rating = int(request.form.get("rating", 5))
    comment = request.form.get("comment", "").strip()

    if comment:
        review = Review(
            project_id=project.id,
            reviewer_id=session["user_id"],
            rating=rating,
            comment=comment
        )
        db_session.add(review)

        # Notify project creator
        reviewer = db_session.get(User, session["user_id"])
        if project.creator_id != session["user_id"]:
            create_notification(
                user_id=project.creator_id,
                title="New Community Review",
                message=f"{reviewer.full_name} left an encouraging review on '{project.title}'.",
                link=f"/projects/{project.id}",
                notif_type="review"
            )

        db_session.commit()
        flash("Thank you for sharing your thoughtful review!", "success")

    return redirect(url_for("project_detail", project_id=project.id))


@app.route("/projects/<int:project_id>/like", methods=["POST"])
@login_required
def like_project(project_id):
    project = db_session.get(Project, project_id)
    if not project:
        return jsonify({"success": False, "error": "Not found"}), 404

    project.likes_count = (project.likes_count or 0) + 1
    db_session.commit()
    return jsonify({"success": True, "likes_count": project.likes_count})


@app.route("/projects/<int:project_id>/report", methods=["POST"])
@login_required
def report_project(project_id):
    reason = request.form.get("reason", "Inappropriate content")
    details = request.form.get("details", "")
    reporter_id = session.get("user_id")

    report = Report(
        project_id=project_id,
        reporter_id=reporter_id,
        reason=reason,
        details=details
    )
    db_session.add(report)
    db_session.commit()

    flash("Thank you for keeping our community safe. Our moderators will review this listing.", "info")
    return redirect(url_for("project_detail", project_id=project_id))


@app.route("/guidelines")
def guidelines():
    return render_template("guidelines.html")


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
