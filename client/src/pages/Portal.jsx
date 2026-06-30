import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  portalGetMe, portalGetQuotes, portalGetAircraft, portalGetNews,
  portalGetBulletins, portalGetFaq, portalGetRequests, portalCreateRequest,
  PORTAL_TOKEN, PORTAL_CUSTOMER,
} from '../api/portal';

const STAGES = [
  { key: 'F1',  desc: 'Fuselage' }, { key: 'F2W', desc: 'Wings' }, { key: 'F2F', desc: 'Final fuselage' },
  { key: 'F3',  desc: 'Assembly' }, { key: 'F4',  desc: 'Systems & paint' }, { key: 'F5',  desc: 'Finishing & delivery' },
];
const DONE_STATUSES = new Set(['completed', 'delivered', 'in_service']);
const BULLETIN_LABELS = { mandatory: 'Mandatory', obligatory: 'Obligatory', recommended: 'Recommended', optional: 'Optional' };

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
const fmtEur = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtKg  = (n) => `${Number(n).toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg`;

function ProductionProgress({ aircraft }) {
  const allDone = DONE_STATUSES.has(aircraft.build_status);
  const currentIdx = allDone ? STAGES.length : STAGES.findIndex(s => s.key === aircraft.production_stage);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', padding: '6px 0' }}>
      {STAGES.map((s, i) => {
        const done = allDone || i < currentIdx;
        const current = !allDone && i === currentIdx;
        const color = done ? '#22c55e' : current ? '#3b82f6' : 'var(--border)';
        const tc = done ? '#22c55e' : current ? '#3b82f6' : 'var(--text-muted)';
        return (
          <React.Fragment key={s.key}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 80 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: done ? '#22c55e' : current ? '#3b82f622' : 'transparent', border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: done ? '#fff' : tc }}>
                {done ? '✓' : s.key}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: tc }}>{s.key}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 }}>{s.desc}</div>
            </div>
            {i < STAGES.length - 1 && <div style={{ flex: 1, height: 2, minWidth: 18, background: (allDone || i < currentIdx) ? '#22c55e' : 'var(--border)', marginTop: 19 }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function QuoteCard({ q }) {
  const base = q.base_price != null ? Number(q.base_price) : null;
  const optionsTotal = (q.options || []).reduce((s, o) => s + (o.option_price != null ? Number(o.option_price) : 0), 0);
  const subtotal = (base || 0) + optionsTotal;
  const vatPct = Number(q.vat_rate ?? 20);
  const total = subtotal * (1 + vatPct / 100);
  const hasPricing = base != null || (q.options || []).some(o => o.option_price != null);
  const addWeight = (q.options || []).reduce((s, o) => s + (o.weight_kg != null ? Number(o.weight_kg) : 0), 0);
  const emptyW = q.empty_weight_kg != null ? Number(q.empty_weight_kg) + addWeight : null;
  const mtom = q.mtom_kg != null ? Number(q.mtom_kg) : null;
  const remaining = (mtom != null && emptyW != null) ? mtom - emptyW : null;
  const byCat = (q.options || []).reduce((a, o) => { (a[o.option_category] ||= []).push(o); return a; }, {});

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>✈ {q.model_name || 'Configuration'}{q.title ? ` — ${q.title}` : ''}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(q.created_at)}</div>
      </div>
      {Object.keys(byCat).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {Object.entries(byCat).map(([cat, opts]) => (
            <div key={cat} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 2 }}>{cat}</div>
              {opts.map(o => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                  <span>{o.option_label}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {o.weight_kg != null ? `${Number(o.weight_kg) > 0 ? '+' : ''}${Number(o.weight_kg)} kg` : ''}
                    {o.option_price != null && Number(o.option_price) > 0 ? `  ·  +€${Number(o.option_price).toLocaleString('de-DE')}` : ''}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {emptyW != null && (
          <div style={{ flex: '1 1 220px', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>Weight & Payload</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Estimated empty weight</span><strong>{fmtKg(emptyW)}</strong></div>
            {mtom != null && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}><span>MTOM</span><span>{fmtKg(mtom)}</span></div>}
            {remaining != null && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4, color: remaining < 0 ? 'var(--danger)' : '#22c55e', fontWeight: 700 }}><span>Remaining payload</span><span>{fmtKg(remaining)}</span></div>}
          </div>
        )}
        {hasPricing && (
          <div style={{ flex: '1 1 220px', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>Price</div>
            {base != null && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Base</span><span>€{base.toLocaleString('de-DE')}</span></div>}
            {optionsTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}><span>Options</span><span>+€{optionsTotal.toLocaleString('de-DE')}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 6, fontWeight: 800, color: 'var(--accent)', borderTop: '1px solid var(--border)', paddingTop: 6 }}>
              <span>Total (incl. {vatPct}% VAT)</span><span>€{fmtEur(total)}</span>
            </div>
          </div>
        )}
      </div>
      {(q.specs || []).length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Specifications</summary>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 8, overflow: 'hidden' }}>
            {q.specs.map((sp, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: 13, borderTop: i ? '1px solid var(--border)' : 'none', background: i % 2 ? 'var(--bg-secondary)' : 'transparent' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{sp.label}</span><span style={{ fontWeight: 600 }}>{sp.value}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function Portal() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('home');
  const [customer, setCustomer] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [aircraft, setAircraft] = useState([]);
  const [news, setNews] = useState([]);
  const [bulletins, setBulletins] = useState([]);
  const [faq, setFaq] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Booking form
  const [bookAircraft, setBookAircraft] = useState('');
  const [bookDate, setBookDate] = useState('');
  const [bookNotes, setBookNotes] = useState('');
  const [booking, setBooking] = useState(false);
  const [bookMsg, setBookMsg] = useState('');

  useEffect(() => {
    if (!localStorage.getItem(PORTAL_TOKEN)) { navigate('/portal/login'); return; }
    (async () => {
      try {
        const me = await portalGetMe();
        if (me.data.portal_must_change_password) { navigate('/portal/change-password'); return; }
        setCustomer(me.data);
        const [qRes, aRes, nRes, bRes, fRes, rRes] = await Promise.allSettled([
          portalGetQuotes(), portalGetAircraft(), portalGetNews(), portalGetBulletins(), portalGetFaq(), portalGetRequests(),
        ]);
        if (qRes.status === 'fulfilled') setQuotes(qRes.value.data || []);
        if (aRes.status === 'fulfilled') setAircraft(aRes.value.data || []);
        if (nRes.status === 'fulfilled') setNews(nRes.value.data || []);
        if (bRes.status === 'fulfilled') setBulletins(bRes.value.data || []);
        if (fRes.status === 'fulfilled') setFaq(fRes.value.data || []);
        if (rRes.status === 'fulfilled') setRequests(rRes.value.data || []);
      } finally { setLoading(false); }
    })();
  }, [navigate]);

  function logout() {
    localStorage.removeItem(PORTAL_TOKEN);
    localStorage.removeItem(PORTAL_CUSTOMER);
    navigate('/portal/login');
  }

  async function submitBooking(e) {
    e.preventDefault();
    setBooking(true); setBookMsg('');
    try {
      await portalCreateRequest({ aircraft_id: bookAircraft || null, requested_date: bookDate || null, notes: bookNotes || null });
      setBookDate(''); setBookNotes(''); setBookAircraft('');
      setBookMsg('✅ Your request has been sent. We will be in touch to confirm.');
      const r = await portalGetRequests(); setRequests(r.data || []);
    } catch {
      setBookMsg('Could not send the request. Please try again.');
    } finally { setBooking(false); }
  }

  const TABS = [
    { key: 'home', label: 'My Aircraft & Configs' },
    { key: 'news', label: `News & Bulletins${news.length + bulletins.length ? ` (${news.length + bulletins.length})` : ''}` },
    { key: 'book', label: 'Book Maintenance' },
    { key: 'faq', label: 'FAQ' },
  ];

  const navBtn = (active) => ({
    background: 'none', border: 'none', padding: '14px 4px', cursor: 'pointer', fontSize: 14,
    fontWeight: active ? 700 : 500, color: active ? 'var(--accent)' : 'var(--text-secondary)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0b0d12)' }}>
      {/* Top bar */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary, #14171f)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>Blackwing</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Customer Portal</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {customer && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{customer.full_name}</span>}
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/portal/change-password')}>Password</button>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Log out</button>
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ background: 'var(--bg-secondary, #14171f)', borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', gap: 20, overflowX: 'auto' }}>
        {TABS.map(t => <button key={t.key} style={navBtn(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 20px' }}>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>
        ) : tab === 'home' ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Welcome{customer?.full_name ? `, ${customer.full_name.split(' ')[0]}` : ''}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>Your aircraft and configuration proposals from Blackwing Sweden AB.</div>

            {aircraft.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Your Aircraft</div>
                {aircraft.map(a => (
                  <div key={a.id} className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>BW-{a.bw_serial}{a.registration ? ` · ${a.registration}` : ''}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{a.model}</div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>Production Progress</div>
                    <ProductionProgress aircraft={a} />
                    {a.photos && a.photos.length > 0 && (
                      <>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', margin: '16px 0 8px' }}>Progress Photos</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {a.photos.map(p => (
                            <div key={p.id} style={{ width: 150 }}>
                              <img src={`/uploads/thumb/fleet/${p.filename}`} alt={p.caption || ''} loading="lazy"
                                onClick={() => window.open(`/uploads/fleet/${p.filename}`, '_blank')}
                                style={{ width: 150, height: 110, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }} />
                              {p.caption && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{p.caption}</div>}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Configuration Proposals</div>
            {quotes.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No configuration proposals yet.</div>
            ) : quotes.map(q => <QuoteCard key={q.id} q={q} />)}
          </>
        ) : tab === 'news' ? (
          <>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>News & Announcements</div>
            {news.length === 0 ? (
              <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 30 }}>No news right now.</div>
            ) : news.map(n => (
              <div key={n.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(n.created_at)}</div>
                </div>
                {n.body && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{n.body}</div>}
              </div>
            ))}

            <div style={{ fontWeight: 800, fontSize: 18, margin: '24px 0 12px' }}>Service Bulletins for your aircraft</div>
            {bulletins.length === 0 ? (
              <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 30 }}>No bulletins affect your aircraft.</div>
            ) : bulletins.map(b => (
              <div key={`${b.id}-${b.bw_serial}`} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{b.title}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{BULLETIN_LABELS[b.category] || b.category}</span>
                    <span style={{ fontSize: 12, color: b.aircraft_status === 'resolved' ? '#22c55e' : '#f59e0b' }}>{b.aircraft_status === 'resolved' ? '✓ Resolved' : 'Open'}</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>BW-{b.bw_serial}</div>
                {b.reason && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}><strong>Reason:</strong> {b.reason}</div>}
                {b.what_to_do && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}><strong>Action:</strong> {b.what_to_do}</div>}
              </div>
            ))}
          </>
        ) : tab === 'book' ? (
          <>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>Request a Maintenance Date</div>
            <div className="card" style={{ marginBottom: 20 }}>
              <form onSubmit={submitBooking} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label className="form-group" style={{ margin: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Aircraft</span>
                  <select value={bookAircraft} onChange={e => setBookAircraft(e.target.value)}>
                    <option value="">— Select aircraft —</option>
                    {aircraft.map(a => <option key={a.id} value={a.id}>BW-{a.bw_serial}{a.registration ? ` · ${a.registration}` : ''}</option>)}
                  </select>
                </label>
                <label className="form-group" style={{ margin: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Preferred date</span>
                  <input type="date" value={bookDate} onChange={e => setBookDate(e.target.value)} />
                </label>
                <label className="form-group" style={{ margin: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>What do you need done?</span>
                  <textarea rows={3} value={bookNotes} onChange={e => setBookNotes(e.target.value)} placeholder="Describe the service / issue…" />
                </label>
                {bookMsg && <div style={{ fontSize: 13, color: bookMsg.startsWith('✅') ? '#22c55e' : 'var(--danger)' }}>{bookMsg}</div>}
                <button type="submit" className="btn btn-primary" disabled={booking} style={{ alignSelf: 'flex-start' }}>{booking ? 'Sending…' : 'Send Request'}</button>
              </form>
            </div>
            {requests.length > 0 && (
              <>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>Your Requests</div>
                {requests.map(r => (
                  <div key={r.id} className="card" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.bw_serial ? `BW-${r.bw_serial}` : 'Aircraft not specified'}{r.requested_date ? ` · ${fmtDate(r.requested_date)}` : ''}</div>
                      {r.notes && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>{r.notes}</div>}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, alignSelf: 'flex-start', background: 'var(--bg-hover)', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{r.status}</span>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>Frequently Asked Questions</div>
            {faq.length === 0 ? (
              <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 30 }}>No FAQs yet.</div>
            ) : faq.map(f => (
              <details key={f.id} className="card" style={{ marginBottom: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>{f.question}</summary>
                {f.answer && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{f.answer}</div>}
              </details>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
