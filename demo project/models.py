from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
from werkzeug.security import generate_password_hash, check_password_hash

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True)
    username = Column(String(80), unique=True, nullable=False)
    email = Column(String(120), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(120), nullable=True)
    bio = Column(Text, nullable=True)
    avatar_url = Column(String(500), nullable=True)
    location = Column(String(120), nullable=True)
    craft_specialty = Column(String(150), nullable=True)
    website = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    projects = relationship("Project", back_populates="creator", foreign_keys="Project.creator_id", cascade="all, delete-orphan")
    adopted_projects = relationship("Project", back_populates="rescuer", foreign_keys="Project.rescuer_id")
    adoption_requests_sent = relationship("AdoptionRequest", back_populates="applicant", foreign_keys="AdoptionRequest.applicant_id")
    adoption_requests_received = relationship("AdoptionRequest", back_populates="owner", foreign_keys="AdoptionRequest.owner_id")
    materials = relationship("MaterialItem", back_populates="donor", foreign_keys="MaterialItem.donor_id")
    reviews = relationship("Review", back_populates="reviewer")
    bookmarks = relationship("Bookmark", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan", order_by="desc(Notification.created_at)")
    collaboration_requests_sent = relationship("CollaborationRequest", back_populates="applicant", foreign_keys="CollaborationRequest.applicant_id")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def unread_notifications_count(self):
        return sum(1 for n in self.notifications if not n.is_read)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "full_name": self.full_name or self.username,
            "bio": self.bio,
            "avatar_url": self.avatar_url,
            "location": self.location,
            "craft_specialty": self.craft_specialty,
            "website": self.website
        }


class Project(Base):
    __tablename__ = 'projects'

    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    short_description = Column(String(300), nullable=False)
    full_description = Column(Text, nullable=False)
    why_abandoned = Column(Text, nullable=True)
    what_is_needed = Column(Text, nullable=True)
    category = Column(String(100), nullable=False) # Art & Painting, Fashion & DIY, etc.
    completion_percentage = Column(Integer, default=50) # 0 to 100
    status = Column(String(50), default="Available for Adoption") # Available for Adoption, In Collaboration, Rescued / Completed, Materials Only
    
    preferred_transfer_type = Column(String(100), default="Adopt my project") # Adopt my project, Collaborate with me, Reuse my materials
    skills_required = Column(String(300), nullable=True)
    
    # PROJECT DNA
    original_idea = Column(Text, nullable=True)
    work_completed_details = Column(Text, nullable=True)
    remaining_work_details = Column(Text, nullable=True)
    creator_message = Column(Text, nullable=True)

    primary_image = Column(String(500), nullable=False)
    before_image = Column(String(500), nullable=True)
    after_image = Column(String(500), nullable=True)
    transformation_story = Column(Text, nullable=True)
    
    materials_included = Column(Text, nullable=True)
    location = Column(String(120), nullable=True)
    estimated_time_to_finish = Column(String(100), nullable=True)
    
    creator_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    rescuer_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    views_count = Column(Integer, default=0)
    likes_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    creator = relationship("User", back_populates="projects", foreign_keys=[creator_id])
    rescuer = relationship("User", back_populates="adopted_projects", foreign_keys=[rescuer_id])
    adoption_requests = relationship("AdoptionRequest", back_populates="project", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="project", cascade="all, delete-orphan", order_by="desc(Review.created_at)")
    collaborations = relationship("Collaboration", back_populates="project", cascade="all, delete-orphan")
    collaboration_requests = relationship("CollaborationRequest", back_populates="project", cascade="all, delete-orphan")
    bookmarks = relationship("Bookmark", back_populates="project", cascade="all, delete-orphan")
    updates = relationship("ProjectUpdate", back_populates="project", cascade="all, delete-orphan", order_by="desc(ProjectUpdate.created_at)")


class ProjectUpdate(Base):
    __tablename__ = 'project_updates'

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=False)
    author_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    image_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="updates")
    author = relationship("User")


class Bookmark(Base):
    __tablename__ = 'bookmarks'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="bookmarks")
    project = relationship("Project", back_populates="bookmarks")


class Notification(Base):
    __tablename__ = 'notifications'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    link = Column(String(250), nullable=True)
    is_read = Column(Boolean, default=False)
    notification_type = Column(String(50), default="general") # adoption_request, adoption_decision, collaboration, review
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notifications")


class AdoptionRequest(Base):
    __tablename__ = 'adoption_requests'

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=False)
    applicant_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    owner_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    message = Column(Text, nullable=False)
    plan_to_complete = Column(Text, nullable=True)
    status = Column(String(30), default="Pending") # Pending, Approved, Declined, Cancelled
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="adoption_requests")
    applicant = relationship("User", back_populates="adoption_requests_sent", foreign_keys=[applicant_id])
    owner = relationship("User", back_populates="adoption_requests_received", foreign_keys=[owner_id])


class Collaboration(Base):
    __tablename__ = 'collaborations'

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=False)
    role_title = Column(String(150), nullable=False) # e.g., "Need a Woodworker", "Looking for React dev"
    skills_needed = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(30), default="Open") # Open, Joined, Filled
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="collaborations")
    requests = relationship("CollaborationRequest", back_populates="collaboration", cascade="all, delete-orphan")


class CollaborationRequest(Base):
    __tablename__ = 'collaboration_requests'

    id = Column(Integer, primary_key=True)
    collaboration_id = Column(Integer, ForeignKey('collaborations.id'), nullable=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=False)
    applicant_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    message = Column(Text, nullable=False)
    skills_offered = Column(String(300), nullable=True)
    status = Column(String(30), default="Pending") # Pending, Accepted, Rejected
    created_at = Column(DateTime, default=datetime.utcnow)

    collaboration = relationship("Collaboration", back_populates="requests")
    project = relationship("Project", back_populates="collaboration_requests")
    applicant = relationship("User", back_populates="collaboration_requests_sent", foreign_keys=[applicant_id])


class MaterialItem(Base):
    __tablename__ = 'materials'

    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(100), nullable=False)
    quantity = Column(String(100), nullable=False) # e.g. "3 meters", "Box of 20 skeins"
    condition = Column(String(50), default="Like New") # Brand New, Like New, Gently Used, Scraps
    location = Column(String(120), nullable=True)
    image_url = Column(String(500), nullable=False)
    donor_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    is_claimed = Column(Boolean, default=False)
    claimed_by_user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    donor = relationship("User", back_populates="materials", foreign_keys=[donor_id])
    claimed_by = relationship("User", foreign_keys=[claimed_by_user_id])


class ProjectStory(Base):
    __tablename__ = 'stories'

    id = Column(Integer, primary_key=True)
    title = Column(String(250), nullable=False)
    excerpt = Column(String(400), nullable=False)
    full_story = Column(Text, nullable=False)
    original_creator_name = Column(String(120), nullable=False)
    rescuer_name = Column(String(120), nullable=False)
    category = Column(String(100), nullable=False)
    image_url = Column(String(500), nullable=False)
    quote = Column(String(300), nullable=True)
    likes_count = Column(Integer, default=12)
    created_at = Column(DateTime, default=datetime.utcnow)


class Review(Base):
    __tablename__ = 'reviews'

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=False)
    reviewer_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    rating = Column(Integer, nullable=False) # 1 to 5
    comment = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="reviews")
    reviewer = relationship("User", back_populates="reviews")


class Report(Base):
    __tablename__ = 'reports'

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=False)
    reporter_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    reason = Column(String(100), nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
