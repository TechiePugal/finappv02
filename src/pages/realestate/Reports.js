import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getProjects, getExpenses, getAllClients, getAllPayments } from '../../utils/re_firestore';
import { fmt, fmtDate, EXP_CATS } from '../../utils/re_helpers';
import { Card, StatCard, Table, Badge, Button, IconBtn, Modal, FormField, Input, Select, Textarea, Grid, Alert, Confirm, PageHeader, SectionHeader, FilterTabs, SearchBar, InfoRow, T, ProgressBar, Loader, SiteTile, Tabs, UploadZone, Divider, KPIRow, ActionMenu, Empty, Btn, Inp, Sel, Ta, Fld, SHead } from '../../components/realestate/UI';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import { BarChart3, TrendingUp, Users, DollarSign } from 'lucide-react';

const COLORS=['#007aff','#34c759','#ff9500','#af52de','#ff3b30','#5ac8fa','#5856d6','#ff2d55'];

export default function Reports() {
  const {user}=useAuth();
  const [data,setData]=useState(null);

  useEffect(()=>{
    async function load(){
      const [projs,clients,pays]=await Promise.all([
        getProjects(user.uid),getAllClients(user.uid),getAllPayments(user.uid),
      ]);
      let expsAll=[];
      for(const p of projs){const e=await getExpenses(p.id);expsAll=[...expsAll,...e];}

      // Monthly revenue
      const monthRev={};
      pays.forEach(p=>{
        const dt=p.date?new Date(p.date):null;
        if(!dt) return;
        const k=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
        monthRev[k]=(monthRev[k]||0)+(p.amount||0);
      });
      const monthly=Object.entries(monthRev).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12).map(([k,v])=>({month:k.slice(5)+'/'+k.slice(2,4),revenue:v}));

      // Expense by category
      const catMap={};
      expsAll.forEach(e=>{catMap[e.category]=(catMap[e.category]||0)+(e.amount||0);});
      const expCats=Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([n,v])=>({name:n,value:v}));

      // Project performance
      const projPerf=projs.map(p=>({
        name:(p.projectName||'').slice(0,14),
        invested:p.totalInvestment||0,
        revenue:p.totalRevenue||0,
        projected:p.projectedRevenue||0,
        profit:(p.totalRevenue||0)-(p.totalInvestment||0),
        sites:p.totalSites||0,
        booked:(p.bookedSites||0)+(p.registeredSites||0)+(p.soldSites||0),
      }));

      // Site status mix
      const statusMix=[
        {name:'Available',value:projs.reduce((s,p)=>s+(p.availableSites||0),0)},
        {name:'Booked',value:projs.reduce((s,p)=>s+(p.bookedSites||0),0)},
        {name:'Registered',value:projs.reduce((s,p)=>s+(p.registeredSites||0),0)},
        {name:'Sold',value:projs.reduce((s,p)=>s+(p.soldSites||0),0)},
        {name:'Reserved',value:projs.reduce((s,p)=>s+(p.reservedSites||0),0)},
        {name:'On Hold',value:projs.reduce((s,p)=>s+(p.onHoldSites||0),0)},
      ].filter(d=>d.value>0);

      // Payment mode split
      const modeMap={};
      pays.forEach(p=>{modeMap[p.mode]=(modeMap[p.mode]||0)+(p.amount||0);});
      const payModes=Object.entries(modeMap).map(([n,v])=>({name:n,value:v}));

      setData({monthly,expCats,projPerf,statusMix,payModes,
        totInv:projs.reduce((s,p)=>s+(p.totalInvestment||0),0),
        totRev:projs.reduce((s,p)=>s+(p.totalRevenue||0),0),
        totProj:projs.reduce((s,p)=>s+(p.projectedRevenue||0),0),
        totClients:clients.length,
        totPays:pays.length,
        totExps:expsAll.reduce((s,e)=>s+(e.amount||0),0),
      });
    }
    load();
  },[user.uid]);

  if(!data) return <><PageHeader title="Reports"/><div style={{}}><Loader/></div></>;

  return (
    <>
      <PageHeader title="Reports & Analytics" subtitle="Financial performance across all projects"/>
      <div className="page fade-in">
        <div className="stats-g" style={{marginBottom:16}}>
          <StatCard label="Total Invested" value={data.totInv} isCurrency icon={DollarSign} accent="#ff9500"/>
          <StatCard label="Revenue Collected" value={data.totRev} isCurrency icon={TrendingUp} accent="#34c759"/>
          <StatCard label="Projected Revenue" value={data.totProj} isCurrency icon={BarChart3} accent="#007aff"/>
          <StatCard label="Net Profit / Loss" value={data.totRev-data.totInv} isCurrency icon={DollarSign} accent={(data.totRev-data.totInv)>=0?'#34c759':'#ff3b30'}/>
        </div>

        {/* Monthly Revenue */}
        <Card style={{marginBottom:16}}><div className="card-p">
          <SectionHeader title="Monthly Revenue Trend"/>
          {data.monthly.length>0?(
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.monthly} margin={{left:-20,right:10}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="month" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>`₹${(v/100000).toFixed(0)}L`}/>
                <Tooltip formatter={v=>fmt(v)}/><Legend/>
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#007aff" strokeWidth={2} dot={{r:3}}/>
              </LineChart>
            </ResponsiveContainer>
          ):<div style={{textAlign:'center',padding:'60px 0',color:'var(--text3)',fontSize:13}}>No payment data yet</div>}
        </div></Card>

        {/* Project Performance */}
        <Card style={{marginBottom:16}}><div className="card-p">
          <SectionHeader title="Project Investment vs Revenue"/>
          {data.projPerf.length>0?(
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.projPerf} margin={{left:-20}}>
                <XAxis dataKey="name" tick={{fontSize:10.5}}/><YAxis tick={{fontSize:10.5}} tickFormatter={v=>`₹${(v/100000).toFixed(0)}L`}/>
                <Tooltip formatter={v=>fmt(v)}/><Legend/>
                <Bar dataKey="invested" name="Invested" fill="#ff9500" radius={[3,3,0,0]}/>
                <Bar dataKey="revenue" name="Collected" fill="#34c759" radius={[3,3,0,0]}/>
                <Bar dataKey="projected" name="Projected" fill="#007aff" radius={[3,3,0,0]} opacity={.5}/>
              </BarChart>
            </ResponsiveContainer>
          ):<div style={{textAlign:'center',padding:'60px 0',color:'var(--text3)',fontSize:13}}>No projects yet</div>}
        </div></Card>

        <div  style={{marginBottom:16}}>
          {/* Expense by Category */}
          <Card><div className="card-p">
            <SectionHeader title="Expense Breakdown" action={<span style={{fontSize:12,color:'var(--text2)'}}>Top 8 categories</span>}/>
            {data.expCats.length>0?(
              <ResponsiveContainer width="100%" height={200}>
                <PieChart><Pie data={data.expCats} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3}>
                  {data.expCats.map((_,i)=><Cell key={i} fill={COLORS[i]}/>)}
                </Pie><Tooltip formatter={v=>fmt(v)}/><Legend/></PieChart>
              </ResponsiveContainer>
            ):<div style={{textAlign:'center',padding:'60px 0',color:'var(--text3)',fontSize:13}}>No expenses yet</div>}
          </div></Card>

          {/* Site Status Mix */}
          <Card><div className="card-p">
            <SectionHeader title="Site Status Distribution"/>
            {data.statusMix.length>0?(
              <ResponsiveContainer width="100%" height={200}>
                <PieChart><Pie data={data.statusMix} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3}>
                  {data.statusMix.map((_,i)=><Cell key={i} fill={COLORS[i]}/>)}
                </Pie><Tooltip/><Legend/></PieChart>
              </ResponsiveContainer>
            ):<div style={{textAlign:'center',padding:'60px 0',color:'var(--text3)',fontSize:13}}>No sites yet</div>}
          </div></Card>
        </div>

        {/* Payment Mode Split */}
        <Card style={{marginBottom:16}}><div className="card-p">
          <SectionHeader title="Payment Mode Analysis"/>
          {data.payModes.length>0?(
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.payModes} layout="vertical" margin={{left:20}}>
                <XAxis type="number" tickFormatter={v=>fmt(v)} tick={{fontSize:11}}/>
                <YAxis type="category" dataKey="name" tick={{fontSize:11}} width={100}/>
                <Tooltip formatter={v=>fmt(v)}/>
                <Bar dataKey="value" name="Amount" fill="#5856d6" radius={[0,4,4,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ):<div style={{textAlign:'center',padding:'60px 0',color:'var(--text3)',fontSize:13}}>No payment data</div>}
        </div></Card>

        {/* Project table */}
        <Card><div className="card-p">
          <SectionHeader title="Project Profitability Summary"/>
          <div className="tbl-w"><table><thead><tr>
            <th>Project</th><th>Sites</th><th>Sold%</th><th>Invested</th><th>Revenue</th><th>Profit/Loss</th><th>ROI</th>
          </tr></thead><tbody>
            {data.projPerf.map((p,i)=>{
              const roi=p.invested>0?(p.profit/p.invested*100):0;
              return <tr key={i}>
                <td style={{fontWeight:600}}>{p.name}</td>
                <td>{p.sites}</td>
                <td>{p.sites>0?((p.booked/p.sites)*100).toFixed(0):0}%</td>
                <td>{fmt(p.invested)}</td>
                <td>{fmt(p.revenue)}</td>
                <td><span className={p.profit>=0?'pos':'neg'}>{fmt(p.profit)}</span></td>
                <td><span className={roi>=0?'pos':'neg'}>{roi.toFixed(1)}%</span></td>
              </tr>;
            })}
          </tbody></table>
          {data.projPerf.length===0&&<div style={{textAlign:'center',padding:'32px',color:'var(--text3)',fontSize:13}}>No projects yet</div>}
          </div>
        </div></Card>
      </div>
    </>
  );
}
