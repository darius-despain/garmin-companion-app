"""
Streamlit Dashboard for Garmin Readiness App

Main application file implementing:
- Top Section: Readiness Gauge (0-100%) and 3-Tier Badge
- Middle Section: Weekly Conditioning Trend card
- Bottom Section: Gap Analysis & Focus Area
"""

import streamlit as st
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import pandas as pd
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

# Import our modules
from garmin_client import get_client
from analytics import (
    calculate_readiness_budget,
    analyze_conditioning_trend,
    diagnose_gaps,
    ReadinessStatus,
    format_conditioning_trend,
    format_gap_analysis
)

# Load environment variables
load_dotenv()

# Page configuration
st.set_page_config(
    page_title="Garmin Readiness Dashboard",
    page_icon="🏃‍♂️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for mobile-friendly styling
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: bold;
        text-align: center;
        margin-bottom: 1rem;
        color: #1f77b4;
    }
    .readiness-gauge {
        text-align: center;
        padding: 1rem;
        border-radius: 10px;
        background-color: #f8f9fa;
        margin: 1rem 0;
    }
    .status-badge {
        display: inline-block;
        padding: 0.5rem 1rem;
        font-size: 1.5rem;
        font-weight: bold;
        border-radius: 20px;
        margin: 1rem 0;
        text-align: center;
    }
    .status-push {
        background-color: #28a745;
        color: white;
    }
    .status-cruise {
        background-color: #ffc107;
        color: #212529;
    }
    .status-recover {
        background-color: #dc3545;
        color: white;
    }
    .metric-card {
        background-color: white;
        border-radius: 10px;
        padding: 1rem;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin: 1rem 0;
    }
    .gap-card {
        background-color: #fff3cd;
        border-left: 4px solid #ffc107;
        padding: 1rem;
        border-radius: 0 10px 10px 0;
        margin: 1rem 0;
    }
    .gap-high {
        border-left-color: #dc3545;
        background-color: #f8d7da;
    }
    .gap-medium {
        border-left-color: #ffc107;
        background-color: #fff3cd;
    }
    .gap-low {
        border-left-color: #28a745;
        background-color: #d4edda;
    }
    @media (max-width: 768px) {
        .main-header {
            font-size: 1.8rem;
        }
        .status-badge {
            font-size: 1.2rem;
            padding: 0.3rem 0.8rem;
        }
    }
</style>
""", unsafe_allow_html=True)


def initialize_session_state():
    """Initialize Streamlit session state variables."""
    if 'garmin_client' not in st.session_state:
        st.session_state.garmin_client = None
    if 'dataset' not in st.session_state:
        st.session_state.dataset = None
    if 'last_update' not in st.session_state:
        st.session_state.last_update = None
    if 'error_message' not in st.session_state:
        st.session_state.error_message = None


def create_readiness_gauge(score: float, status: ReadinessStatus) -> go.Figure:
    """Create a circular gauge chart for readiness score."""
    # Determine color based on status
    if status == ReadinessStatus.PUSH:
        color = "#28a745"  # Green
    elif status == ReadinessStatus.CRUISE:
        color = "#ffc107"  # Yellow
    else:
        color = "#dc3545"  # Red
    
    fig = go.Figure(go.Indicator(
        mode = "gauge+number",
        value = score,
        domain = {'x': [0, 1], 'y': [0, 1]},
        title = {'text': "Readiness Score", 'font': {'size': 24}},
        number = {'font': {'size': 40}},
        gauge = {
            'axis': {'range': [None, 100], 'tickwidth': 1, 'tickcolor': "darkblue"},
            'bar': {'color': color},
            'bgcolor': "white",
            'borderwidth': 2,
            'bordercolor': "gray",
            'steps': [
                {'range': [0, 45], 'color': '#ffebee'},
                {'range': [45, 75], 'color': '#fff8e1'},
                {'range': [75, 100], 'color': '#e8f5e9'}
            ],
            'threshold': {
                'line': {'color': "red", 'width': 4},
                'thickness': 0.75,
                'value': 90
            }
        }
    ))
    
    fig.update_layout(
        height=300,
        margin=dict(l=20, r=20, t=40, b=20),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)"
    )
    
    return fig


def create_trend_sparkline(data: list, title: str, color: str = "#1f77b4") -> go.Figure:
    """Create a simple sparkline chart."""
    if not data:
        # Return empty figure with message
        fig = go.Figure()
        fig.add_annotation(
            text="No data",
            xref="paper", yref="paper",
            x=0.5, y=0.5,
            showarrow=False,
            font=dict(size=12, color="gray")
        )
        fig.update_layout(
            height=80,
            margin=dict(l=0, r=0, t=20, b=0),
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)"
        )
        return fig
    
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        y=data,
        mode='lines+markers',
        line=dict(color=color, width=2),
        marker=dict(size=4),
        fill='tozeroy',
        fillcolor=color.replace(')', ', 0.1)').replace('rgb', 'rgba') if 'rgb' in color else f"rgba{color[4:-1]}, 0.1)"
    ))
    
    fig.update_layout(
        title=dict(text=title, font=dict(size=10)),
        height=80,
        margin=dict(l=0, r=0, t=20, b=0),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        xaxis=dict(showgrid=False, showticklabels=False, zeroline=False),
        yaxis=dict(showgrid=False, showticklabels=False, zeroline=False)
    )
    
    return fig


def main():
    """Main application function."""
    initialize_session_state()
    
    # Header
    st.markdown('<h1 class="main-header">🏃‍♂️ Garmin Readiness Dashboard</h1>', unsafe_allow_html=True)
    
    # Sidebar
    with st.sidebar:
        st.header("⚙️ Configuration")
        
        # Credentials input
        st.subheader("Garmin Connect Login")
        username = st.text_input(
            "Email/Username",
            value=os.getenv("GARMIN_USERNAME", ""),
            placeholder="your.email@example.com"
        )
        password = st.text_input(
            "Password",
            type="password",
            value=os.getenv("GARMIN_PASSWORD", ""),
            help="App will store tokens locally to avoid frequent MFA prompts"
        )
        
        # Connect button
        if st.button("🔗 Connect to Garmin", type="primary"):
            if username and password:
                with st.spinner("Connecting to Garmin Connect..."):
                    try:
                        client = get_client(username, password)
                        st.session_state.garmin_client = client
                        st.success("✅ Connected successfully!")
                    except Exception as e:
                        st.error(f"❌ Connection failed: {str(e)}")
                        st.session_state.error_message = str(e)
            else:
                st.warning("Please enter both username and password")
        
        st.divider()
        
        # Data refresh controls
        st.subheader("Data Management")
        if st.session_state.garmin_client:
            if st.button("🔄 Refresh Data", type="secondary"):
                with st.spinner("Fetching latest data from Garmin Connect..."):
                    try:
                        dataset = st.session_state.garmin_client.get_full_28_day_dataset()
                        st.session_state.dataset = dataset
                        st.session_state.last_update = datetime.now()
                        st.success("✅ Data refreshed!")
                    except Exception as e:
                        st.error(f"❌ Data fetch failed: {str(e)}")
                        st.session_state.error_message = str(e)
            
            # Show last update time
            if st.session_state.last_update:
                st.caption(f"Last updated: {st.session_state.last_update.strftime('%H:%M:%S')}")
        else:
            st.info("Connect to Garmin to enable data refresh")
        
        # Logout button
        if st.session_state.garmin_client:
            if st.button("🚪 Logout", type="secondary"):
                try:
                    st.session_state.garmin_client.logout()
                    st.session_state.garmin_client = None
                    st.session_state.dataset = None
                    st.session_state.last_update = None
                    st.success("Logged out successfully")
                except Exception as e:
                    st.error(f"Logout error: {e}")
    
    # Main content area
    if st.session_state.error_message:
        st.error(f"Error: {st.session_state.error_message}")
        if st.button("Clear Error"):
            st.session_state.error_message = None
            st.rerun()
    
    # Check if we have data to display
    if not st.session_state.dataset:
        st.info("👈 Please connect to Garmin Connect and refresh data to see your readiness dashboard")
        
        # Show sample layout when no data
        with st.container():
            st.markdown("### Dashboard Preview")
            col1, col2, col3 = st.columns([1, 1, 1])
            
            with col1:
                st.markdown('<div class="metric-card"><h3>Readiness Score</h3><p>--%</p></div>', unsafe_allow_html=True)
            
            with col2:
                st.markdown('<div class="metric-card"><h3>Conditioning Trend</h3><p>--</p></div>', unsafe_allow_html=True)
            
            with col3:
                st.markdown('<div class="metric-card"><h3>Focus Area</h3><p>--</p></div>', unsafe_allow_html=True)
        
        return
    
    # Process and display data
    dataset = st.session_state.dataset
    
    # Calculate metrics
    today = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    readiness = calculate_readiness_budget(dataset, today)
    conditioning = analyze_conditioning_trend(dataset)
    gaps = diagnose_gaps(dataset)
    
    # Top Section: Readiness Gauge and Status
    st.markdown("### 📊 Daily Readiness Assessment")
    
    col1, col2 = st.columns([1, 1])
    
    with col1:
        # Readiness Gauge
        gauge_fig = create_readiness_gauge(readiness.score, readiness.status)
        st.plotly_chart(gauge_fig, use_container_width=True)
    
    with col2:
        # Status Badge and Breakdown
        status_class = f"status-{readiness.status.value.lower()}"
        st.markdown(f'''
        <div class="readiness-gauge">
            <div class="status-badge {status_class}">
                {readiness.status.value}
            </div>
            <p><strong>Score:</strong> {readiness.score}/100</p>
        </div>
        ''', unsafe_allow_html=True)
        
        # Component breakdown
        st.markdown("#### Score Breakdown")
        breakdown_data = []
        for component, data in readiness.breakdown.items():
            if component != 'total' and component != 'status':
                breakdown_data.append({
                    'Component': component.upper(),
                    'Score': f"{data['score']:.1f}",
                    'Weight': f"{data['weight']}%",
                    'Contribution': f"{data['weighted']:.1f}"
                })
        
        if breakdown_data:
            df = pd.DataFrame(breakdown_data)
            st.dataframe(df, hide_index=True, use_container_width=True)
    
    st.divider()
    
    # Middle Section: Weekly Conditioning Trend
    st.markdown("### 📈 Weekly Conditioning Trend")
    
    col1, col2 = st.columns([2, 1])
    
    with col1:
        # Conditioning trend display
        trend_text = format_conditioning_trend(conditioning)
        st.markdown(f'''
        <div class="metric-card">
            <h4>Aerobic Efficiency Analysis</h4>
            <p>{trend_text}</p>
            <small>Lower efficiency index = better performance (faster pace at lower relative HR)</small>
        </div>
        ''', unsafe_allow_html=True)
        
        # Sparkline charts for HRV and RHR trends
        spark_col1, spark_col2 = st.columns(2)
        
        with spark_col1:
            if conditioning.hrv_trend:
                hrv_fig = create_trend_sparkline(conditioning.hrv_trend, "HRV Trend (7-day)", "#2E86AB")
                st.plotly_chart(hrv_fig, use_container_width=True)
            else:
                st.markdown('<div class="metric-card"><p>No HRV trend data</p></div>', unsafe_allow_html=True)
        
        with spark_col2:
            if conditioning.rhr_trend:
                rhr_fig = create_trend_sparkline(conditioning.rhr_trend, "RHR Trend (7-day)", "#A23B72")
                st.plotly_chart(rhr_fig, use_container_width=True)
            else:
                st.markdown('<div class="metric-card"><p>No RHR trend data</p></div>', unsafe_allow_html=True)
    
    with col2:
        # Efficiency interpretation
        if conditioning.direction != "No Data":
            if conditioning.direction == "Improving":
                interpretation = "🟢 Your running efficiency is improving - you're getting faster for the same effort!"
                color = "#28a745"
            elif conditioning.direction == "Slumping":
                interpretation = "🔴 Your running efficiency is declining - consider easier recovery days"
                color = "#dc3545"
            else:
                interpretation = "🟡 Your running efficiency is stable - maintain current training"
                color = "#ffc107"
            
            st.markdown(f'''
            <div class="metric-card" style="border-left: 4px solid {color};">
                <h4>Trend Interpretation</h4>
                <p>{interpretation}</p>
            </div>
            ''', unsafe_allow_html=True)
    
    st.divider()
    
    # Bottom Section: Gap Analysis & Focus Area
    st.markdown("### 🎯 Gap Analysis & Focus Area")
    
    # Primary gap display
    priority_colors = {
        "High": "#dc3545",
        "Medium": "#ffc107", 
        "Low": "#28a745"
    }
    priority_color = priority_colors.get(gaps.priority, "#6c757d")
    
    st.markdown(f'''
    <div class="gap-card gap-{gaps.priority.lower()}">
        <h4>{gaps.primary_gap}</h4>
        <p>{gaps.details}</p>
    </div>
    ''', unsafe_allow_html=True)
    
    # Additional gaps if any
    if len(gaps.all_gaps) > 1:
        st.markdown("#### Additional Areas to Monitor")
        for i, gap in enumerate(gaps.all_gaps[1:], 1):
            priority_color = priority_colors.get(gap['priority'], "#6c757d")
            st.markdown(f'''
            <div style="border-left: 3px solid {priority_color}; padding-left: 1rem; margin: 0.5rem 0;">
                <strong>{gap['title']}</strong><br>
                <small>{gap['details']}</small>
            </div>
            ''', unsafe_allow_html=True)
    
    # Footer
    st.divider()
    st.caption(
        "Garmin Readiness App • Data sourced from Garmin Connect • "
        f"Last updated: {st.session_state.last_update.strftime('%Y-%m-%d %H:%M:%S') if st.session_state.last_update else 'Never'}"
    )


if __name__ == "__main__":
    main()