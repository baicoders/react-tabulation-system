import { useState } from 'react';
import './design-system.css';

const colors = [
  { name: 'Teal 50', value: '#eaf5f6', token: 'Subtle emphasis' },
  { name: 'Teal 100', value: '#d4ebee', token: 'Selected surface' },
  { name: 'Teal 600', value: '#1b6c80', token: 'Primary / focus' },
  { name: 'Teal 700', value: '#155768', token: 'Primary hover' },
  { name: 'Slate 50', value: '#f8fafc', token: 'Inset surface' },
  { name: 'Slate 200', value: '#e2e8f0', token: 'Borders' },
  { name: 'Slate 900', value: '#0f172a', token: 'Headings' },
];

/** A contained proposal: these examples do not change production component styles. */
export function DesignSystemPage() {
  const [selected, setSelected] = useState('A');

  return (
    <div className="design-preview">
      <header className="design-intro">
        <p className="design-eyebrow">Tally design system · proposal</p>
        <h1>A clearer way to count.</h1>
        <p>A teal identity for focused work: calm surfaces, clear decisions, and components that feel at home on every screen.</p>
        <div className="design-intro-actions">
          <a className="design-button primary" href="#components">Explore components</a>
          <a className="design-button secondary" href="#responsive">See mobile patterns</a>
        </div>
      </header>

      <section className="design-section" aria-labelledby="foundation-title">
        <div className="design-section-heading">
          <div><p className="design-eyebrow">01 / Foundations</p><h2 id="foundation-title">A focused visual language</h2></div>
          <p>Teal belongs to the product. Status colors communicate meaning, not decoration.</p>
        </div>
        <div className="design-swatches">
          {colors.map((color) => <div className="design-swatch" key={color.name}>
            <div className="design-swatch-color" style={{ backgroundColor: color.value }} />
            <strong>{color.name}</strong><span>{color.value}</span><span>{color.token}</span>
          </div>)}
        </div>
        <div className="design-foundation-grid">
          <div className="design-card"><p className="design-label">Typography</p><h3>Confidence in every detail</h3><p>IBM Plex Sans keeps labels readable and numeric work compact. Headings, supporting text, and tabular figures each have a clear role.</p><div className="design-number">97.25 <span>points</span></div></div>
          <div className="design-card"><p className="design-label">Semantic color</p><h3>Meaning before decoration</h3><div className="design-badges"><span className="design-badge info">In progress</span><span className="design-badge success">Submitted</span><span className="design-badge warning">Needs review</span><span className="design-badge danger">Not saved</span><span className="design-badge neutral">Draft</span></div><p>Every state is labeled; color never carries the message alone.</p></div>
        </div>
      </section>

      <section className="design-section" id="components" aria-labelledby="components-title">
        <div className="design-section-heading"><div><p className="design-eyebrow">02 / Components</p><h2 id="components-title">The everyday essentials</h2></div><p>Consistent states and comfortable controls, without changing the work itself.</p></div>
        <div className="design-foundation-grid">
          <div className="design-card"><p className="design-label">Actions</p><h3>Buttons and states</h3><div className="design-buttons"><button className="design-button primary" type="button">Save changes</button><button className="design-button secondary" type="button">Cancel</button><button className="design-button quiet" type="button">View details</button><button className="design-button primary" type="button" disabled>Unavailable</button></div><p>One primary action per context. Secondary actions stay quiet; destructive actions are explicit.</p></div>
          <div className="design-card"><p className="design-label">Form controls</p><h3>Labels that stay visible</h3><div className="design-form"><label>Search candidates<input placeholder="Name or candidate number" /></label><label>Round<select defaultValue="preliminary"><option value="preliminary">Preliminary round</option><option value="final">Final round</option></select></label></div><p>Clear borders, visible focus, and room for touch without sacrificing desktop density.</p></div>
        </div>
      </section>

      <section className="design-section" id="responsive" aria-labelledby="responsive-title">
        <div className="design-section-heading"><div><p className="design-eyebrow">03 / Working patterns</p><h2 id="responsive-title">Built for the event floor</h2></div><p>Resize this page to see the same components adapt. Data stays readable instead of being squeezed.</p></div>
        <div className="design-work-grid">
          <div className="design-card"><div className="design-card-heading"><div><p className="design-label">Admin · example</p><h3>Candidate standings</h3></div><span className="design-badge neutral">3 candidates</span></div><div className="design-table-wrap" tabIndex={0} role="region" aria-label="Example candidate standings, scroll horizontally for all columns"><table className="design-table"><thead><tr><th>Rank</th><th>Candidate</th><th>Score</th><th>Status</th></tr></thead><tbody><tr><td>01</td><td><strong>Alex Rivera</strong><span className="design-table-sub">Candidate 04</span></td><td>97.25</td><td><span className="design-badge success">Complete</span></td></tr><tr><td>02</td><td><strong>Sam Flores</strong><span className="design-table-sub">Candidate 12</span></td><td>94.50</td><td><span className="design-badge info">In progress</span></td></tr><tr><td>03</td><td><strong>Jordan Cruz</strong><span className="design-table-sub">Candidate 08</span></td><td>—</td><td><span className="design-badge warning">Awaiting scores</span></td></tr></tbody></table></div><p className="design-hint">On narrow screens, wide tables scroll within their own container.</p></div>
          <div className="design-card"><p className="design-label">Judge · example</p><h3>Choose your selection</h3><p>Large, labeled choices make the current selection unmistakable.</p><div className="design-picks" role="group" aria-label="Example pair vote">{['A', 'B'].map((item) => <button key={item} type="button" className="design-pick" aria-pressed={selected === item} onClick={() => setSelected(item)}><span className="design-avatar">{item}</span><span><strong>Candidate {item}</strong><small>{selected === item ? 'Selected' : 'Tap to select'}</small></span><span className="design-pick-mark" aria-hidden="true">{selected === item ? '✓' : '○'}</span></button>)}</div><div className="design-notice"><strong>Scores saved</strong><span>Feedback stays visible and uses words as well as color.</span></div></div>
        </div>
      </section>
      <p className="design-footer">Design proposal only · Existing workflows and organization branding are unchanged.</p>
    </div>
  );
}
