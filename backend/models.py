from sqlalchemy import Column, String, Float, DateTime, Text, Integer, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class AccountModel(Base):
    """Connected bank/investment account"""
    __tablename__ = "accounts"
    
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False, default="Account")
    type = Column(String, nullable=False)  # "bank" or "investment"
    balance = Column(Float, default=0.0)
    currency = Column(String, default="CZK")
    institution = Column(String, nullable=True)
    details_json = Column(Text, nullable=True)  # Raw JSON from API
    last_synced = Column(DateTime, default=datetime.utcnow)
    is_visible = Column(Boolean, default=True)
    
    # Relationship to transactions
    transactions = relationship("TransactionModel", back_populates="account", cascade="all, delete-orphan")


class TransactionModel(Base):
    """Transaction from bank or investment account"""
    __tablename__ = "transactions"
    
    id = Column(String, primary_key=True)
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    description = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String, default="CZK")
    category = Column(String, nullable=True)
    account_type = Column(String, nullable=False)  # "bank" or "investment"
    raw_json = Column(Text, nullable=True)  # Original API response
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationship to account
    account = relationship("AccountModel", back_populates="transactions")


class SyncStatusModel(Base):
    """Synchronization status tracking"""
    __tablename__ = "sync_status"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String, default="running")  # "running", "completed", "failed"
    error_message = Column(Text, nullable=True)
    accounts_synced = Column(Integer, default=0)
    transactions_synced = Column(Integer, default=0)


class SettingsModel(Base):
    """Application settings (API keys, preferences)"""
    __tablename__ = "settings"
    
    key = Column(String, primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BudgetModel(Base):
    """Monthly budget per category"""
    __tablename__ = "budgets"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(String, nullable=False)  # "Food", "Transport", etc.
    amount = Column(Float, nullable=False)  # Monthly limit in CZK
    currency = Column(String, default="CZK")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SavingsGoalModel(Base):
    """Savings goal with target amount"""
    __tablename__ = "savings_goals"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)  # "Dovolená", "Nové auto"
    target_amount = Column(Float, nullable=False)
    current_amount = Column(Float, default=0.0)
    currency = Column(String, default="CZK")
    deadline = Column(String, nullable=True)  # YYYY-MM-DD
    is_completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class CategoryRuleModel(Base):
    """Category rule for automatic transaction categorization"""
    __tablename__ = "category_rules"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    pattern = Column(String, nullable=False)  # Text pattern to match (lowercase)
    category = Column(String, nullable=False)  # Target category (Food, Transport, etc.)
    is_user_defined = Column(Boolean, default=True)  # True = user created, False = learned
    match_count = Column(Integer, default=0)  # How many times this rule matched
    created_at = Column(DateTime, default=datetime.utcnow)

