# Avengers Market Analyst Agent Team — 11 Agents

# Phase 1: Data Gathering
from .iron_man import IronMan, analyze as tech_analyze, format_report as tech_format
from .captain_america import CaptainAmerica
from .scarlet_witch import ScarletWitch
from .thor import Thor
from .vision import Vision
from .spider_man import SpiderMan

# Phase 2: Signal Generation
from .black_widow import BlackWidow

# Phase 3: Risk Management
from .doctor_strange import DoctorStrange

# Phase 4: Backtesting
from .hulk import Hulk

# Trade Journaling
from .war_machine import WarMachine

# Webhook Receiver
from .hawkeye import Hawkeye

# Orchestrator
from .nick_fury import NickFury
