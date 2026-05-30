import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getDashStats } from '../../utils/re_firestore';
import { fmt, holdingStr } from '../../utils/re_helpers';
import { Card, StatCard, Table, Badge, Button, IconBtn, Modal, FormField, Input, Select, Textarea, Grid, Alert, Confirm, PageHeader, SectionHeader, FilterTabs, SearchBar, InfoRow, T, ProgressBar, Loader, SiteTile, Tabs, UploadZone, Divider, KPIRow, ActionMenu, Empty, Btn, Inp, Sel, Ta, Fld, SHead } from '../../components/realestate/UI';
import { Building2, MapPin, Users, Wallet, TrendingUp, DollarSign, BarChart3, Activity, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS=['#34c759','#ff9500','#af52de','#2196f3','#e91e63','#9e9e9e'];

export default function Dashboard({ onNav }) {
  const {user}=useAuth();
  const [s,setS]=useState(null);
  useEffect(()=>{getDashStats(user.uid).then(setS);},[user.uid]);

  if(!s) return <Loader/>;

  const soldPct=s.totalSites>0?((s.bookedSites+s.registeredSites+s.soldSites)/s.totalSites)*100:0;

  const chartData=s.projects.slice(0,8).map(p=>({
    name:(p.projectName||'').slice(0,12),
    invested:p.totalInvestment||0, revenue:p.totalRevenue||0,
  }));

  const pieData=[
    {name:'Available',value:s.availableSites},
    {name:'Booked',value:s.bookedSites},
    {name:'Registered',value:s.registeredSites},
    {name:'Sold',value:s.soldSites},
    {name:'Reserved',value:s.reservedSites},
    {name:'On Hold',value:s.onHoldSites},
  ].filter(d=>d.value>0);

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Welcome back, ${user.displayName?.split(' ')[0]||'User'}`}
        actions={<Button size="sm" icon={Building2} onClick={()=>onNav('projects')}>New Project</Button>}/>
      <div className="page fade-in">
        {/* Site KPIs */}
        <div className="stats-g" style={{marginBottom:16}}>
          <StatCard label="Total Sites" value={s.totalSites} icon={MapPin} accent="#007aff" sub={`Across ${s.totalProjects} projects`}/>
          <StatCard label="Available" value={s.availableSites} icon={Activity} accent="#34c759"/>
          <StatCard label="Booked" value={s.bookedSites} icon={Users} accent="#ff9500"/>
          <StatCard label="Registered/Sold" value={s.registeredSites+s.soldSites} icon={TrendingUp} accent="#af52de"/>
        </div>
        {/* Financial KPIs */}
        <div className="stats-g" style={{marginBottom:16}}>
          <StatCard label="Total Investment" value={s.totalInvestment} isCurrency icon={Wallet} accent="#ff3b30"/>
          <StatCard label="Total Revenue" value={s.totalRevenue} isCurrency icon={DollarSign} accent="#34c759"/>
          <StatCard label="Net Profit/Loss" value={s.netProfit} isCurrency icon={BarChart3}
            accent={s.netProfit>=0?'#34c759':'#ff3b30'} sub={s.netProfit>=0?'Profitable':'In deficit'}/>
          <StatCard label="Investor Funds" value={s.totalFunded} isCurrency icon={Users} accent="#5856d6"/>
        </div>

        {/* Occupancy */}
        <Card style={{marginBottom:16}}>
          <div className="card-p">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <span className="sec-title">Portfolio Occupancy</span>
              <span style={{fontSize:13,color:'var(--text2)'}}>{soldPct.toFixed(0)}% engaged</span>
            </div>
            <ProgressBar value={soldPct} height={8}/>
            <div style={{display:'flex',gap:16,marginTop:10,fontSize:12,color:'var(--text2)',flexWrap:'wrap'}}>
              {[['Available','#34c759',s.availableSites],['Booked','#ff9500',s.bookedSites],
                ['Registered','#2196f3',s.registeredSites],['Sold','#af52de',s.soldSites],
                ['Reserved','#e91e63',s.reservedSites],['On Hold','#9e9e9e',s.onHoldSites]].map(([lbl,col,val])=>
                val>0?<span key={lbl}><span style={{color:col}}>●</span> {lbl}: {val}</span>:null
              )}
            </div>
          </div>
        </Card>

        {/* Charts */}
        <div  style={{marginBottom:16}}>
          <Card><div className="card-p">
            <SectionHeader title="Investment vs Revenue"/>
            {chartData.length>0?(
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={chartData} margin={{left:-20}}>
                  <XAxis dataKey="name" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>`₹${(v/100000).toFixed(0)}L`}/>
                  <Tooltip formatter={v=>fmt(v)}/><Legend/>
                  <Bar dataKey="invested" name="Invested" fill="#ff9500" radius={[3,3,0,0]}/>
                  <Bar dataKey="revenue" name="Revenue" fill="#34c759" radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            ):<div style={{textAlign:'center',padding:'60px 0',color:'var(--text3)',fontSize:13}}>No projects yet</div>}
          </div></Card>
          <Card><div className="card-p">
            <SectionHeader title="Site Status Mix"/>
            {pieData.length>0?(
              <ResponsiveContainer width="100%" height={210}>
                <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3}>
                  {pieData.map((_,i)=><Cell key={i} fill={COLORS[i]}/>)}</Pie>
                  <Legend/><Tooltip/></PieChart>
              </ResponsiveContainer>
            ):<div style={{textAlign:'center',padding:'60px 0',color:'var(--text3)',fontSize:13}}>No sites yet</div>}
          </div></Card>
        </div>

        {/* Recent projects */}
        <Card><div className="card-p">
          <SectionHeader title="Recent Projects"
            action={<Button variant="ghost" size="sm" onClick={()=>onNav('projects')}>View all</Button>}/>
          {s.projects.length===0?(
            <div style={{textAlign:'center',padding:'32px 0',color:'var(--text3)',fontSize:13.5}}>No projects yet — create your first layout project</div>
          ):s.projects.slice(0,5).map(p=>{
            const progress=p.totalSites>0?((p.bookedSites||0)+(p.registeredSites||0)+(p.soldSites||0))/p.totalSites*100:0;
            const profit=(p.totalRevenue||0)-(p.totalInvestment||0);
            return (
              <div key={p.id} style={{display:'flex',gap:14,alignItems:'center',padding:'12px 0',borderBottom:'1px solid var(--border2)',cursor:'pointer'}}
                onClick={()=>onNav('project-detail',p)}>
                <div style={{width:42,height:42,borderRadius:11,background:'var(--blue-bg)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <Building2 size={20} color="var(--blue)"/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14}}>{p.projectName}</div>
                  <div style={{fontSize:12,color:'var(--text2)',marginBottom:4}}>{p.location} · {p.totalSites||0} sites · {holdingStr(p.purchaseDate)} holding</div>
                  <ProgressBar value={progress} height={3}/>
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontSize:13,fontWeight:600}}>{fmt(p.totalRevenue||0)}</div>
                  <div className={profit>=0?'pos':'neg'} style={{fontSize:12}}>{profit>=0?'+':''}{fmt(profit)}</div>
                </div>
              </div>
            );
          })}
        </div></Card>
      </div>
    </>
  );
}
