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
    transaction_type = Column(String, default="normal")  # "normal", "internal_transfer", "family_transfer"
    is_excluded = Column(Boolean, default=False)  # True = excluded from income/expense calculations
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


class CategoryModel(Base):
    """User-defined transaction categories"""
    __tablename__ = "categories"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)  # "Food", "Transport", etc.
    icon = Column(String, default="📦")  # Emoji icon
    color = Column(String, default="#6366f1")  # Hex color for charts
    order_index = Column(Integer, default=0)  # Display order
    is_income = Column(Boolean, default=False)  # True for income categories like Salary
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# === Monthly Budget Tracker Models ===

class MonthlyBudgetModel(Base):
    """Měsíční rozpočet - příjmy a přebytek"""
    __tablename__ = "monthly_budgets"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    year_month = Column(String, nullable=False, unique=True)  # "2025-01"
    
    # Příjmy
    salary = Column(Float, default=0.0)
    other_income = Column(Float, default=0.0)
    meal_vouchers = Column(Float, default=0.0)
    
    # Investice (manuální částka tento měsíc)
    investment_amount = Column(Float, default=0.0)
    
    # Přebytek poslaný na spořící účet
    surplus_to_savings = Column(Float, default=0.0)
    
    is_closed = Column(Boolean, default=False)  # Měsíc uzavřen
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    expenses = relationship("MonthlyExpenseModel", back_populates="budget", cascade="all, delete-orphan")


class RecurringExpenseModel(Base):
    """Šablona pravidelného měsíčního výdaje"""
    __tablename__ = "recurring_expenses"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)  # "Nájem + Služby", "Netflix"
    default_amount = Column(Float, nullable=False)
    my_percentage = Column(Integer, default=100)  # Můj podíl v % (50 = platím půlku)
    is_auto_paid = Column(Boolean, default=False)  # Zelené = automtatická platba z účtu
    match_pattern = Column(String, nullable=True)  # Pattern pro auto-match s transakcemi
    category = Column(String, nullable=True)  # Pro seskupení
    order_index = Column(Integer, default=0)  # Pořadí v seznamu
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class MonthlyExpenseModel(Base):
    """Konkrétní výdaj v konkrétním měsíci"""
    __tablename__ = "monthly_expenses"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    budget_id = Column(Integer, ForeignKey("monthly_budgets.id"), nullable=False)
    recurring_expense_id = Column(Integer, ForeignKey("recurring_expenses.id"), nullable=True)
    
    name = Column(String, nullable=False)  # Může být jiný než recurring
    amount = Column(Float, nullable=False)  # Celková částka platby
    my_percentage = Column(Integer, default=100)  # Můj podíl v %
    is_paid = Column(Boolean, default=False)
    is_auto_paid = Column(Boolean, default=False)
    matched_transaction_id = Column(String, nullable=True)  # ID transakce co to zaplatila
    
    # Relationships
    budget = relationship("MonthlyBudgetModel", back_populates="expenses")


class ManualAccountModel(Base):
    """Manuálně sledovaný účet (spořící účet bez API)"""
    __tablename__ = "manual_accounts"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)  # "Spořící účet"
    account_number = Column(String, nullable=True)  # "2049290001/6000" for internal transfer detection
    balance = Column(Float, default=0.0)
    currency = Column(String, default="CZK")
    is_visible = Column(Boolean, default=True)  # Show in sidebar
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    items = relationship("ManualAccountItemModel", back_populates="account", cascade="all, delete-orphan")


class ManualAccountItemModel(Base):
    """Položky/obálky na manuálním účtu"""
    __tablename__ = "manual_account_items"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("manual_accounts.id"), nullable=False)
    name = Column(String, nullable=False)  # "Peníze od partnera", "Rezerva"
    amount = Column(Float, nullable=False)
    is_mine = Column(Boolean, default=True)  # True = moje peníze, False = cizí/půjčené
    note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    account = relationship("ManualAccountModel", back_populates="items")

