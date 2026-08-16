import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { Plus, X, Search, GitBranch, Rows3, Pencil, Trash2, Download, Upload, ChevronRight, Users, Link2 } from 'lucide-react';

/* ---------------------------------- helpers ---------------------------------- */

function generateId() {
  return 'm_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

// Formats an ISO date string ("1958-03-12") as "12 Mar 1958".
// Falls back to showing whatever was typed if it isn't a full date
// (handy for old relatives where only a year is known).
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Formats a date stored as "YYYY", "YYYY-MM", or "YYYY-MM-DD" into
// "1958", "Mar 1958", or "12 Mar 1958" — whatever precision is known.
function formatDate(value) {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  if (!y) return '';
  if (!m) return y;
  const monthName = MONTH_NAMES[parseInt(m, 10) - 1] || '';
  if (!d) return `${monthName} ${y}`.trim();
  return `${parseInt(d, 10)} ${monthName} ${y}`.trim();
}

// Husband/Wife/Spouse label, based on the gender of the person being described.
function spouseSectionLabel(gender, count = 1) {
  if (gender === 'male') return count > 1 ? 'Wives' : 'Wife';
  if (gender === 'female') return count > 1 ? 'Husbands' : 'Husband';
  return count > 1 ? 'Spouses' : 'Spouse';
}

// Same as above, but returns null when gender is unset/other — used to decide
// whether a Husband/Wife quick-add button should show up next to the generic
// Spouse button (no point showing both when the word would be identical).
function spouseGenderWord(gender, count = 1) {
  if (gender === 'male') return count > 1 ? 'Wives' : 'Wife';
  if (gender === 'female') return count > 1 ? 'Husbands' : 'Husband';
  return null;
}

function getChildrenIds(members, parentId) {
  return members.filter((m) => (m.parents || []).includes(parentId)).map((m) => m.id);
}

function computeLevels(members) {
  const levels = {};
  members.forEach((m) => {
    if (!(m.parents && m.parents.length)) levels[m.id] = 0;
  });
  let changed = true;
  let guard = 0;
  while (changed && guard < members.length + 15) {
    changed = false;
    guard++;
    members.forEach((m) => {
      if (m.parents && m.parents.length) {
        const pl = m.parents.map((pid) => levels[pid]).filter((v) => v !== undefined);
        if (pl.length) {
          const lvl = Math.max(...pl) + 1;
          if (levels[m.id] !== lvl) {
            levels[m.id] = lvl;
            changed = true;
          }
        }
      }
    });
    members.forEach((m) => {
      if (levels[m.id] === undefined) return;
      (m.spouses || []).forEach((sid) => {
        const other = levels[sid];
        const target = other === undefined ? levels[m.id] : Math.max(levels[m.id], other);
        if (levels[m.id] !== target) {
          levels[m.id] = target;
          changed = true;
        }
        if (levels[sid] !== target) {
          levels[sid] = target;
          changed = true;
        }
      });
    });
  }
  members.forEach((m) => {
    if (levels[m.id] === undefined) levels[m.id] = 0;
  });
  return levels;
}

function computeOrderedGroups(members, levels, byId) {
  const maxLevel = members.length ? Math.max(...members.map((m) => levels[m.id] || 0)) : 0;
  const raw = {};
  members.forEach((m) => {
    const l = levels[m.id] || 0;
    raw[l] = raw[l] || [];
    raw[l].push(m.id);
  });
  const sorted = {};
  for (let l = 0; l <= maxLevel; l++) {
    const ids = raw[l] || [];
    let scored;
    if (l === 0 || !sorted[l - 1]) {
      scored = ids
        .map((id) => ({ id, score: byId[id].name.toLowerCase() }))
        .sort((a, b) => (a.score < b.score ? -1 : a.score > b.score ? 1 : 0));
    } else {
      const prevIndex = {};
      sorted[l - 1].forEach((id, idx) => {
        prevIndex[id] = idx;
      });
      scored = ids
        .map((id) => {
          const m = byId[id];
          const pIdxs = (m.parents || []).map((pid) => prevIndex[pid]).filter((v) => v !== undefined);
          const score = pIdxs.length ? pIdxs.reduce((a, b) => a + b, 0) / pIdxs.length : Number.MAX_SAFE_INTEGER;
          return { id, score };
        })
        .sort((a, b) => a.score - b.score);
    }
    const arr = scored.map((s) => s.id);
    const used = new Set();
    const finalArr = [];
    arr.forEach((id) => {
      if (used.has(id)) return;
      finalArr.push(id);
      used.add(id);
      (byId[id].spouses || []).forEach((sid) => {
        if (arr.includes(sid) && !used.has(sid)) {
          finalArr.push(sid);
          used.add(sid);
        }
      });
    });
    sorted[l] = finalArr;
  }
  return { groups: sorted, maxLevel };
}

function groupIntoPairs(ids, byId) {
  const result = [];
  const used = new Set();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (used.has(id)) continue;
    const m = byId[id];
    const next = ids[i + 1];
    if (next && m.spouses?.includes(next) && !used.has(next)) {
      result.push([id, next]);
      used.add(id);
      used.add(next);
    } else {
      result.push([id]);
      used.add(id);
    }
  }
  return result;
}

const GENDER_META = {
  male: { label: 'Male', varName: '--teal' },
  female: { label: 'Female', varName: '--rose' },
};

/* ---------------------------------- small UI atoms ---------------------------------- */

function Avatar({ member, size = 44 }) {
  const color = `var(${GENDER_META[member.gender]?.varName || '--plum'})`;
  return (
    <div
      className="ft-avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `color-mix(in srgb, ${color} 22%, var(--surface))`,
        color: color,
        border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
      }}
    >
      {initials(member.name)}
    </div>
  );
}

function MemberCard({ m, onSelect, selected, dimmed, registerRef }) {
  return (
    <button
      type="button"
      ref={(node) => registerRef(m.id, node)}
      onClick={() => onSelect(m.id)}
      className={`ft-card${selected ? ' ft-card-selected' : ''}`}
      style={{ opacity: dimmed ? 0.32 : 1 }}
    >
      <Avatar member={m} />
      <div className="ft-card-text">
        <div className="ft-card-name">{m.name}</div>
        <div className="ft-card-years">
          {formatDate(m.dob) || '—'}
          {m.dod ? ` – ${formatDate(m.dod)}` : m.dob ? ' –' : ''}
        </div>
        {m.familyGroup && <div className="ft-card-group">{m.familyGroup}</div>}
      </div>
    </button>
  );
}

function DateFields({ label, value, onChange }) {
  const [year = '', month = '', day = ''] = (value || '').split('-');

  function update(newYear, newMonth, newDay) {
    if (!newYear) {
      onChange('');
      return;
    }
    let out = newYear;
    if (newMonth) {
      out += '-' + newMonth;
      if (newDay) out += '-' + newDay;
    }
    onChange(out);
  }

  return (
    <div className="ft-field">
      <label className="ft-label">{label}</label>
      <div className="ft-date-fields">
        <input
          type="text"
          inputMode="numeric"
          className="ft-input ft-mono ft-date-year"
          placeholder="Year"
          value={year}
          onChange={(e) => update(e.target.value.replace(/\D/g, '').slice(0, 4), month, day)}
        />
        <select
          className="ft-input ft-date-month"
          value={month}
          disabled={!year}
          onChange={(e) => update(year, e.target.value, day)}
        >
          <option value="">Month</option>
          {MONTH_NAMES.map((mn, idx) => (
            <option key={mn} value={String(idx + 1).padStart(2, '0')}>
              {mn}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="numeric"
          className="ft-input ft-mono ft-date-day"
          placeholder="Day"
          disabled={!year || !month}
          value={day}
          onChange={(e) => update(year, month, e.target.value.replace(/\D/g, '').slice(0, 2))}
        />
      </div>
      <div className="ft-hint">Year is enough on its own — month and day are optional extras.</div>
    </div>
  );
}

function RelationPicker({ label, hint, members, excludeIds, selectedIds, onChange }) {
  const [query, setQuery] = useState('');
  const available = members.filter(
    (m) => !excludeIds.includes(m.id) && !selectedIds.includes(m.id) && m.name.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <div className="ft-field">
      <label className="ft-label">{label}</label>
      {hint && <div className="ft-hint">{hint}</div>}
      {selectedIds.length > 0 && (
        <div className="ft-chips">
          {selectedIds.map((id) => {
            const m = members.find((x) => x.id === id);
            if (!m) return null;
            return (
              <span key={id} className="ft-chip">
                {m.name}
                <button type="button" onClick={() => onChange(selectedIds.filter((x) => x !== id))} aria-label={`Remove ${m.name}`}>
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="ft-picker">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people already in the tree…"
          className="ft-input"
        />
        {query && (
          <div className="ft-picker-dropdown">
            {available.length === 0 && <div className="ft-picker-empty">No matches</div>}
            {available.slice(0, 6).map((m) => (
              <button
                type="button"
                key={m.id}
                className="ft-picker-item"
                onClick={() => {
                  onChange([...selectedIds, m.id]);
                  setQuery('');
                }}
              >
                {m.name}
                {m.dob && <span className="ft-muted-sm"> · b. {formatDate(m.dob)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- modal ---------------------------------- */

function MemberModal({ members, editingMember, presetRelation, familyGroups, onClose, onSave }) {
  const isEdit = !!editingMember;
  const [name, setName] = useState(editingMember?.name || '');
  const [familyGroup, setFamilyGroup] = useState(editingMember?.familyGroup || '');
  const [gender, setGender] = useState(editingMember?.gender || 'male');
  const [dob, setDob] = useState(editingMember?.dob || '');
  const [dod, setDod] = useState(editingMember?.dod || '');
  const [notes, setNotes] = useState(editingMember?.notes || '');
  const [parents, setParents] = useState(
    editingMember?.parents || (presetRelation?.type === 'child' ? [presetRelation.relatedId] : [])
  );
  const [spouses, setSpouses] = useState(
    editingMember?.spouses || (presetRelation?.type === 'spouse' ? [presetRelation.relatedId] : [])
  );
  const [otherSpouses, setOtherSpouses] = useState(
    editingMember?.otherSpouses || (presetRelation?.type === 'otherSpouse' ? [presetRelation.relatedId] : [])
  );
  const [children, setChildren] = useState(
    isEdit ? getChildrenIds(members, editingMember.id) : presetRelation?.type === 'parent' ? [presetRelation.relatedId] : []
  );
  const [error, setError] = useState('');

  const excludeIds = isEdit ? [editingMember.id] : [];

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('This person needs a name.');
      return;
    }
    onSave({
      id: editingMember?.id,
      name,
      familyGroup,
      gender,
      dob,
      dod,
      notes,
      parents,
      spouses,
      otherSpouses,
      children,
    });
  }

  return (
    <div className="ft-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ft-modal" role="dialog" aria-modal="true">
        <div className="ft-modal-head">
          <h2>{isEdit ? 'Edit person' : 'Add a person'}</h2>
          <button type="button" className="ft-icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="ft-form">
          <div className="ft-field">
            <label className="ft-label">Full name</label>
            <input className="ft-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kartar Singh" autoFocus />
          </div>

          <div className="ft-field">
            <label className="ft-label">Family / group</label>
            <div className="ft-hint">Optional — e.g. "Rathi family", "Sura family". Lets you view branches combined or one at a time.</div>
            <input
              className="ft-input"
              list="ft-family-group-options"
              value={familyGroup}
              onChange={(e) => setFamilyGroup(e.target.value)}
              placeholder="e.g. Rathi family"
            />
            <datalist id="ft-family-group-options">
              {familyGroups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>

          <div className="ft-field">
            <label className="ft-label">Gender</label>
            <div className="ft-segmented">
              {Object.entries(GENDER_META).map(([key, meta]) => (
                <button
                  type="button"
                  key={key}
                  className={`ft-segment${gender === key ? ' ft-segment-active' : ''}`}
                  style={gender === key ? { borderColor: `var(${meta.varName})`, color: `var(${meta.varName})` } : {}}
                  onClick={() => setGender(key)}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ft-row-2">
            <DateFields label="Date of birth" value={dob} onChange={setDob} />
            <DateFields label="Date of death (if applicable)" value={dod} onChange={setDod} />
          </div>

          <div className="ft-field">
            <label className="ft-label">Notes</label>
            <textarea className="ft-input ft-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Village, occupation, stories worth remembering…" />
          </div>

          <div className="ft-divider" />

          <RelationPicker label="Parents" hint="Usually up to two." members={members} excludeIds={excludeIds} selectedIds={parents} onChange={setParents} />
          <RelationPicker
            label={spouseSectionLabel(gender, 2)}
            hint={gender === 'male' ? 'Who is his wife?' : gender === 'female' ? 'Who is her husband?' : 'Who is their spouse?'}
            members={members}
            excludeIds={excludeIds}
            selectedIds={spouses}
            onChange={setSpouses}
          />
          <RelationPicker
            label="Spouse"
            hint="A separate field — use this for an additional marriage, not linked to the field above."
            members={members}
            excludeIds={excludeIds}
            selectedIds={otherSpouses}
            onChange={setOtherSpouses}
          />
          <RelationPicker label="Children" members={members} excludeIds={excludeIds} selectedIds={children} onChange={setChildren} />

          {error && <div className="ft-error">{error}</div>}

          <div className="ft-modal-actions">
            <button type="button" className="ft-btn ft-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="ft-btn ft-btn-primary">
              {isEdit ? 'Save changes' : 'Add to tree'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------------- link existing spouse ---------------------------------- */

// Separate from the "add a new person as my spouse" quick-add buttons above:
// this links two people who are ALREADY in the tree, so you don't end up
// creating a duplicate entry for someone who's already been added.
function InlineSpouseLinker({ member, members, onLink }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const available = members.filter(
    (m) => m.id !== member.id && !(member.spouses || []).includes(m.id) && m.name.toLowerCase().includes(query.toLowerCase())
  );

  if (!open) {
    return (
      <button type="button" className="ft-btn ft-btn-tiny" onClick={() => setOpen(true)}>
        <Link2 size={13} /> Link existing spouse
      </button>
    );
  }

  return (
    <div className="ft-inline-linker">
      <input
        autoFocus
        className="ft-input"
        placeholder="Search people already in the tree…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="ft-picker-dropdown ft-picker-dropdown-static">
        {available.length === 0 && <div className="ft-picker-empty">No matches</div>}
        {available.slice(0, 6).map((m) => (
          <button
            type="button"
            key={m.id}
            className="ft-picker-item"
            onClick={() => {
              onLink(m.id);
              setOpen(false);
              setQuery('');
            }}
          >
            {m.name}
            {m.dob && <span className="ft-muted-sm"> · b. {formatDate(m.dob)}</span>}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="ft-btn ft-btn-ghost ft-btn-tiny"
        onClick={() => {
          setOpen(false);
          setQuery('');
        }}
      >
        Cancel
      </button>
    </div>
  );
}

/* ---------------------------------- detail drawer ---------------------------------- */

function DetailDrawer({ member, members, byId, onClose, onEdit, onDelete, onQuickAdd, onLinkSpouse, onJump }) {
  const parents = (member.parents || []).map((id) => byId[id]).filter(Boolean);
  const spouses = (member.spouses || []).map((id) => byId[id]).filter(Boolean);
  const otherSpouses = (member.otherSpouses || []).map((id) => byId[id]).filter(Boolean);
  const children = members.filter((m) => (m.parents || []).includes(member.id));

  const RelList = ({ title, list }) =>
    list.length > 0 && (
      <div className="ft-drawer-section">
        <div className="ft-drawer-section-title">{title}</div>
        <div className="ft-chips">
          {list.map((p) => (
            <button type="button" key={p.id} className="ft-chip ft-chip-link" onClick={() => onJump(p.id)}>
              {p.name} <ChevronRight size={11} />
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <div className="ft-drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="ft-drawer">
        <button type="button" className="ft-icon-btn ft-drawer-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <div className="ft-drawer-head">
          <Avatar member={member} size={64} />
          <div>
            <div className="ft-drawer-name">{member.name}</div>
            <div className="ft-card-years ft-mono">
              {formatDate(member.dob) || '—'}
              {member.dod ? ` – ${formatDate(member.dod)}` : ''}
            </div>
          </div>
        </div>

        {member.notes && <p className="ft-drawer-notes">{member.notes}</p>}

        <RelList title="Parents" list={parents} />
        <RelList title={spouseSectionLabel(member.gender, spouses.length)} list={spouses} />
        <RelList title="Spouse" list={otherSpouses} />
        <RelList title="Children" list={children} />

        <div className="ft-drawer-section">
          <div className="ft-drawer-section-title">Add a relative</div>
          <div className="ft-quickadd-row">
            <button type="button" className="ft-btn ft-btn-tiny" onClick={() => onQuickAdd('child', member.id)}>
              <Plus size={13} /> Parent
            </button>
            {spouseGenderWord(member.gender) && (
              <button type="button" className="ft-btn ft-btn-tiny" onClick={() => onQuickAdd('spouse', member.id)}>
                <Plus size={13} /> {spouseGenderWord(member.gender)}
              </button>
            )}
            <button type="button" className="ft-btn ft-btn-tiny" onClick={() => onQuickAdd('otherSpouse', member.id)}>
              <Plus size={13} /> Spouse
            </button>
            <button type="button" className="ft-btn ft-btn-tiny" onClick={() => onQuickAdd('parent', member.id)}>
              <Plus size={13} /> Child
            </button>
          </div>
          <div className="ft-link-existing-row">
            <InlineSpouseLinker member={member} members={members} onLink={(spouseId) => onLinkSpouse(member.id, spouseId)} />
          </div>
        </div>

        <div className="ft-modal-actions ft-drawer-actions">
          <button type="button" className="ft-btn ft-btn-ghost" onClick={() => onEdit(member.id)}>
            <Pencil size={14} /> Edit
          </button>
          <button type="button" className="ft-btn ft-btn-danger" onClick={() => onDelete(member.id)}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ---------------------------------- tree view ---------------------------------- */

function TreeView({ members, byId, groups, maxLevel, onSelect, selectedId, search }) {
  const containerRef = useRef(null);
  const nodeRefs = useRef({});
  const [paths, setPaths] = useState([]);
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const cRect = el.getBoundingClientRect();
      const sl = el.scrollLeft;
      const st = el.scrollTop;
      const newPaths = [];
      members.forEach((m) => {
        (m.parents || []).forEach((pid) => {
          const childEl = nodeRefs.current[m.id];
          const parentEl = nodeRefs.current[pid];
          if (childEl && parentEl) {
            const c = childEl.getBoundingClientRect();
            const p = parentEl.getBoundingClientRect();
            const x1 = p.left - cRect.left + sl + p.width / 2;
            const y1 = p.top - cRect.top + st + p.height;
            const x2 = c.left - cRect.left + sl + c.width / 2;
            const y2 = c.top - cRect.top + st;
            const midY = (y1 + y2) / 2;
            newPaths.push({ id: `${pid}_${m.id}`, d: `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}` });
          }
        });
      });
      setPaths(newPaths);
      setSvgSize({ w: el.scrollWidth, h: el.scrollHeight });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    el.addEventListener('scroll', compute);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
    };
  }, [members, groups]);

  const registerRef = (id, node) => {
    if (node) nodeRefs.current[id] = node;
  };

  const q = search.trim().toLowerCase();

  return (
    <div ref={containerRef} className="ft-tree-scroll">
      <svg className="ft-tree-svg" width={svgSize.w} height={svgSize.h}>
        {paths.map((p) => (
          <path key={p.id} d={p.d} className="ft-branch" />
        ))}
      </svg>
      <div className="ft-tree-rows">
        {Array.from({ length: maxLevel + 1 }).map((_, lvl) => (
          <div key={lvl} className="ft-gen-row">
            <div className="ft-gen-label">GENERATION {String(lvl + 1).padStart(2, '0')}</div>
            <div className="ft-gen-members">
              {groupIntoPairs(groups[lvl] || [], byId).map((pair) => (
                <div key={pair.join('-')} className={pair.length === 2 ? 'ft-couple' : ''}>
                  {pair.map((id, idx) => (
                    <div key={id} style={{ display: 'contents' }}>
                      {idx === 1 && <span className="ft-spouse-link" aria-hidden="true" />}
                      <MemberCard
                        m={byId[id]}
                        onSelect={onSelect}
                        selected={selectedId === id}
                        dimmed={q && !byId[id].name.toLowerCase().includes(q)}
                        registerRef={registerRef}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- list view ---------------------------------- */

function ListRow({ m, byId, onSelect }) {
  const parents = (m.parents || []).map((id) => byId[id]?.name).filter(Boolean);
  const spouses = (m.spouses || []).map((id) => byId[id]?.name).filter(Boolean);
  const otherSpouses = (m.otherSpouses || []).map((id) => byId[id]?.name).filter(Boolean);
  return (
    <button type="button" className="ft-list-row" onClick={() => onSelect(m.id)}>
      <Avatar member={m} size={40} />
      <div className="ft-list-row-text">
        <div className="ft-card-name">
          {m.name}
          {m.familyGroup && <span className="ft-card-group ft-card-group-inline">{m.familyGroup}</span>}
        </div>
        <div className="ft-muted-sm">
          {[
            parents.length ? `Parents: ${parents.join(', ')}` : null,
            spouses.length ? `${spouseSectionLabel(m.gender, spouses.length)}: ${spouses.join(', ')}` : null,
            otherSpouses.length ? `Spouse: ${otherSpouses.join(', ')}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'No relations recorded yet'}
        </div>
      </div>
      <ChevronRight size={16} className="ft-muted" />
    </button>
  );
}

function ListView({ members, byId, groups, maxLevel, onSelect, search }) {
  const q = search.trim().toLowerCase();
  if (q) {
    const filtered = members.filter((m) => m.name.toLowerCase().includes(q));
    return (
      <div className="ft-list">
        {filtered.length === 0 && <div className="ft-muted-sm ft-list-empty">No one matches “{search}”.</div>}
        {filtered.map((m) => (
          <ListRow key={m.id} m={m} byId={byId} onSelect={onSelect} />
        ))}
      </div>
    );
  }
  return (
    <div className="ft-list">
      {Array.from({ length: maxLevel + 1 }).map((_, lvl) => (
        <div key={lvl}>
          <div className="ft-gen-label ft-gen-label-list">GENERATION {String(lvl + 1).padStart(2, '0')}</div>
          {(groups[lvl] || []).map((id) => (
            <ListRow key={id} m={byId[id]} byId={byId} onSelect={onSelect} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------- app ---------------------------------- */

export default function FamilyTreeApp() {
  const [members, setMembers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [view, setView] = useState('tree');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [groupFilter, setGroupFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [presetRelation, setPresetRelation] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('family-tree-members');
      const parsed = raw ? JSON.parse(raw) : [];
      // Migrate data saved by an earlier version that only stored a birth/death year.
      const migrated = parsed.map((m) => ({
        ...m,
        dob: m.dob ?? (m.birthYear ? `${m.birthYear}` : ''),
        dod: m.dod ?? (m.deathYear ? `${m.deathYear}` : ''),
      }));
      setMembers(migrated);
    } catch {
      setMembers([]);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem('family-tree-members', JSON.stringify(members));
      setSaveError('');
    } catch {
      setSaveError('Could not save — your browser storage may be full or disabled.');
    }
  }, [members, loaded]);

  const byId = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);
  const familyGroups = useMemo(
    () => Array.from(new Set(members.map((m) => (m.familyGroup || '').trim()).filter(Boolean))).sort(),
    [members]
  );
  const visibleMembers = useMemo(
    () => (groupFilter ? members.filter((m) => (m.familyGroup || '').trim() === groupFilter) : members),
    [members, groupFilter]
  );
  const levels = useMemo(() => computeLevels(visibleMembers), [visibleMembers]);
  const { groups, maxLevel } = useMemo(() => computeOrderedGroups(visibleMembers, levels, byId), [visibleMembers, levels, byId]);
  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 7);
  }, [search, members]);

  function openAdd() {
    setEditingId(null);
    setPresetRelation(null);
    setModalOpen(true);
  }

  function openAddWithRelation(type, relatedId) {
    setEditingId(null);
    setPresetRelation({ type, relatedId });
    setModalOpen(true);
    setSelectedId(null);
  }

  function openEdit(id) {
    setEditingId(id);
    setPresetRelation(null);
    setModalOpen(true);
    setSelectedId(null);
  }

  function handleSave(formData) {
    setMembers((prev) => {
      const isEdit = !!formData.id;
      const id = isEdit ? formData.id : generateId();
      const prevMember = isEdit ? prev.find((m) => m.id === id) : null;
      const prevChildren = isEdit ? getChildrenIds(prev, id) : [];
      const prevSpouses = prevMember?.spouses || [];
      const prevOtherSpouses = prevMember?.otherSpouses || [];

      const record = {
        id,
        name: formData.name.trim(),
        familyGroup: formData.familyGroup.trim(),
        gender: formData.gender,
        dob: formData.dob || '',
        dod: formData.dod || '',
        notes: formData.notes.trim(),
        parents: formData.parents,
        spouses: formData.spouses,
        otherSpouses: formData.otherSpouses,
      };

      let next = isEdit ? prev.map((m) => (m.id === id ? record : m)) : [...prev, record];

      const toAddChild = formData.children.filter((cid) => !prevChildren.includes(cid));
      const toRemoveChild = prevChildren.filter((cid) => !formData.children.includes(cid));
      next = next.map((m) => {
        if (toAddChild.includes(m.id)) return { ...m, parents: Array.from(new Set([...(m.parents || []), id])) };
        if (toRemoveChild.includes(m.id)) return { ...m, parents: (m.parents || []).filter((p) => p !== id) };
        return m;
      });

      const toRemoveSpouse = prevSpouses.filter((sid) => !formData.spouses.includes(sid));
      next = next.map((m) => (toRemoveSpouse.includes(m.id) ? { ...m, spouses: (m.spouses || []).filter((s) => s !== id) } : m));

      const toRemoveOtherSpouse = prevOtherSpouses.filter((sid) => !formData.otherSpouses.includes(sid));
      next = next.map((m) =>
        toRemoveOtherSpouse.includes(m.id) ? { ...m, otherSpouses: (m.otherSpouses || []).filter((s) => s !== id) } : m
      );

      next = next.map((m) => ({ ...m }));
      next.forEach((m) => {
        (m.spouses || []).forEach((sid) => {
          const sp = next.find((x) => x.id === sid);
          if (sp && !(sp.spouses || []).includes(m.id)) sp.spouses = [...(sp.spouses || []), m.id];
        });
        (m.otherSpouses || []).forEach((sid) => {
          const sp = next.find((x) => x.id === sid);
          if (sp && !(sp.otherSpouses || []).includes(m.id)) sp.otherSpouses = [...(sp.otherSpouses || []), m.id];
        });
      });

      return next;
    });
    setModalOpen(false);
    setEditingId(null);
    setPresetRelation(null);
  }

  function handleDelete(id) {
    setMembers((prev) =>
      prev
        .filter((m) => m.id !== id)
        .map((m) => ({
          ...m,
          parents: (m.parents || []).filter((p) => p !== id),
          spouses: (m.spouses || []).filter((s) => s !== id),
          otherSpouses: (m.otherSpouses || []).filter((s) => s !== id),
        }))
    );
    setSelectedId(null);
  }

  // Links two people who are already in the tree as spouses (symmetric on both sides),
  // separate from the "add a brand-new person as my spouse" quick-add flow.
  function handleLinkSpouse(memberId, spouseId) {
    setMembers((prev) => {
      const next = prev.map((m) => ({ ...m }));
      const a = next.find((m) => m.id === memberId);
      const b = next.find((m) => m.id === spouseId);
      if (a && b) {
        if (!(a.spouses || []).includes(spouseId)) a.spouses = [...(a.spouses || []), spouseId];
        if (!(b.spouses || []).includes(memberId)) b.spouses = [...(b.spouses || []), memberId];
      }
      return next;
    });
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(members, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'family-tree.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (Array.isArray(parsed)) setMembers(parsed);
      } catch {
        /* ignore malformed file */
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const selectedMember = selectedId ? byId[selectedId] : null;
  const editingMember = editingId ? byId[editingId] : null;
  const genCount = maxLevel + (visibleMembers.length ? 1 : 0);

  return (
    <div className="ft-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

        .ft-root {
          --bg: #12201a;
          --surface: #1b2c22;
          --surface-hover: #23392c;
          --border: #33493a;
          --border-strong: #4a6350;
          --text: #ede7d6;
          --text-muted: #9fac9a;
          --gold: #c9a24b;
          --rose: #b5677a;
          --teal: #4f8b7a;
          --plum: #8e7cb8;
          --danger: #c06a5c;
          --font-display: 'Fraunces', serif;
          --font-body: 'Inter', sans-serif;
          --font-mono: 'IBM Plex Mono', monospace;

          background: var(--bg);
          color: var(--text);
          font-family: var(--font-body);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .ft-root * { box-sizing: border-box; }
        .ft-root button { font-family: inherit; cursor: pointer; }

        /* header */
        .ft-header {
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--border);
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          justify-content: space-between;
          align-items: flex-end;
        }
        .ft-title { font-family: var(--font-display); font-size: 28px; font-weight: 600; letter-spacing: -0.01em; }
        .ft-subtitle { color: var(--text-muted); font-size: 13px; margin-top: 3px; }
        .ft-header-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .ft-search { position: relative; }
        .ft-search input {
          background: var(--surface); border: 1px solid var(--border); color: var(--text);
          border-radius: 8px; padding: 8px 10px 8px 32px; font-size: 13px; width: 190px; outline: none;
        }
        .ft-search input:focus { border-color: var(--gold); }
        .ft-search svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
        .ft-search-dropdown { z-index: 20; width: 260px; }
        .ft-select {
          background: var(--surface); border: 1px solid var(--border); color: var(--text);
          border-radius: 8px; padding: 8px 10px; font-size: 12.5px; outline: none; max-width: 180px;
        }
        .ft-select:focus { border-color: var(--gold); }
        .ft-view-toggle { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 2px; }
        .ft-view-btn { display: flex; align-items: center; gap: 5px; padding: 6px 10px; border-radius: 6px; border: none; background: transparent; color: var(--text-muted); font-size: 12px; }
        .ft-view-btn-active { background: var(--surface-hover); color: var(--gold); }
        .ft-icon-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); border-radius: 8px; padding: 7px; display: flex; }
        .ft-icon-btn:hover { color: var(--text); border-color: var(--border-strong); }

        .ft-flourish { height: 18px; opacity: 0.5; }

        /* buttons */
        .ft-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 15px; border-radius: 8px; font-size: 13px; font-weight: 600; border: 1px solid transparent; }
        .ft-btn-primary { background: var(--gold); color: #1b1408; }
        .ft-btn-primary:hover { background: #d6ae57; }
        .ft-btn-ghost { background: transparent; border-color: var(--border); color: var(--text); }
        .ft-btn-ghost:hover { border-color: var(--border-strong); }
        .ft-btn-danger { background: transparent; border-color: color-mix(in srgb, var(--danger) 55%, transparent); color: var(--danger); }
        .ft-btn-danger:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); }
        .ft-btn-tiny { padding: 6px 10px; font-size: 12px; background: var(--surface-hover); border-color: var(--border); color: var(--text); }

        /* empty / loading */
        .ft-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 40px; text-align: center; }
        .ft-empty h3 { font-family: var(--font-display); font-size: 22px; font-weight: 600; }
        .ft-empty p { color: var(--text-muted); font-size: 14px; max-width: 360px; line-height: 1.5; }
        .ft-loading { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px; }

        /* tree */
        .ft-tree-scroll { flex: 1; overflow: auto; position: relative; padding: 28px 32px 40px; }
        .ft-tree-svg { position: absolute; top: 0; left: 0; pointer-events: none; }
        .ft-branch { fill: none; stroke: color-mix(in srgb, var(--gold) 55%, transparent); stroke-width: 1.6; }
        .ft-tree-rows { position: relative; display: flex; flex-direction: column; gap: 36px; width: max-content; min-width: 100%; }
        .ft-gen-row { display: flex; flex-direction: column; gap: 10px; }
        .ft-gen-label { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.14em; color: var(--gold); opacity: 0.75; }
        .ft-gen-label-list { margin: 18px 0 8px; padding-left: 2px; }
        .ft-gen-members { display: flex; gap: 22px; align-items: stretch; }
        .ft-couple { display: flex; align-items: center; }
        .ft-spouse-link { width: 16px; height: 2px; background: color-mix(in srgb, var(--gold) 45%, transparent); display: inline-block; }

        .ft-card {
          display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--border);
          border-radius: 10px; padding: 8px 14px 8px 8px; text-align: left; min-width: 170px; transition: border-color .15s, transform .15s;
          animation: ft-fade-in .35s ease both;
        }
        .ft-card:hover { border-color: var(--border-strong); transform: translateY(-1px); }
        .ft-card-selected { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
        .ft-card-text { min-width: 0; }
        .ft-card-name { font-family: var(--font-display); font-size: 14.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
        .ft-card-years { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-top: 1px; }
        .ft-card-group { font-size: 10.5px; color: var(--gold); opacity: 0.8; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
        .ft-card-group-inline { display: inline-block; margin-top: 0; margin-left: 8px; max-width: none; font-family: var(--font-mono); }
        .ft-avatar { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-weight: 600; flex-shrink: 0; }

        @keyframes ft-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .ft-card { animation: none; } }

        /* list */
        .ft-list { padding: 8px 24px 32px; overflow-y: auto; flex: 1; }
        .ft-list-row { display: flex; align-items: center; gap: 12px; width: 100%; background: transparent; border: none; border-bottom: 1px solid var(--border); padding: 11px 4px; text-align: left; color: var(--text); }
        .ft-list-row:hover { background: var(--surface); border-radius: 8px; }
        .ft-list-row-text { flex: 1; min-width: 0; }
        .ft-list-empty { padding: 24px 4px; }
        .ft-muted { color: var(--text-muted); }
        .ft-muted-sm { color: var(--text-muted); font-size: 12px; }
        .ft-mono { font-family: var(--font-mono); }

        /* modal */
        .ft-overlay { position: fixed; inset: 0; background: rgba(8, 14, 10, 0.72); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
        .ft-modal { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto; }
        .ft-modal-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--surface); }
        .ft-modal-head h2 { font-family: var(--font-display); font-size: 19px; font-weight: 600; }
        .ft-form { padding: 18px 20px 22px; display: flex; flex-direction: column; gap: 15px; }
        .ft-field { display: flex; flex-direction: column; gap: 6px; }
        .ft-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .ft-date-fields { display: flex; gap: 6px; }
        .ft-date-year { flex: 1.2; min-width: 0; }
        .ft-date-month { flex: 1.6; min-width: 0; }
        .ft-date-day { flex: 0.9; min-width: 0; }
        .ft-date-fields select:disabled, .ft-date-fields input:disabled { opacity: 0.4; cursor: not-allowed; }
        .ft-label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .ft-hint { font-size: 11.5px; color: var(--text-muted); margin-top: -4px; }
        .ft-input { background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 9px 11px; font-size: 13.5px; outline: none; width: 100%; font-family: var(--font-body); }
        .ft-input:focus { border-color: var(--gold); }
        .ft-textarea { min-height: 64px; resize: vertical; }
        .ft-segmented { display: flex; gap: 8px; }
        .ft-segment { flex: 1; padding: 8px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text-muted); font-size: 12.5px; font-weight: 600; }
        .ft-segment-active { background: var(--surface-hover); }
        .ft-divider { height: 1px; background: var(--border); margin: 2px 0; }
        .ft-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .ft-chip { display: inline-flex; align-items: center; gap: 5px; background: var(--surface-hover); border: 1px solid var(--border); border-radius: 999px; padding: 4px 6px 4px 10px; font-size: 12px; }
        .ft-chip button { background: transparent; border: none; color: var(--text-muted); display: flex; padding: 2px; }
        .ft-chip-link { background: transparent; color: var(--gold); border-color: color-mix(in srgb, var(--gold) 40%, transparent); }
        .ft-picker { position: relative; }
        .ft-picker-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--bg); border: 1px solid var(--border-strong); border-radius: 8px; z-index: 5; max-height: 160px; overflow-y: auto; }
        .ft-picker-item { width: 100%; text-align: left; padding: 9px 11px; background: transparent; border: none; color: var(--text); font-size: 13px; }
        .ft-picker-item:hover { background: var(--surface-hover); }
        .ft-picker-empty { padding: 10px 11px; color: var(--text-muted); font-size: 12.5px; }
        .ft-error { color: var(--danger); font-size: 12.5px; }
        .ft-modal-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }

        /* drawer */
        .ft-drawer-overlay { position: fixed; inset: 0; background: rgba(8, 14, 10, 0.55); display: flex; justify-content: flex-end; z-index: 40; }
        .ft-drawer { width: 100%; max-width: 340px; background: var(--surface); border-left: 1px solid var(--border); height: 100%; overflow-y: auto; padding: 22px 20px; position: relative; }
        .ft-drawer-close { position: absolute; top: 16px; right: 16px; }
        .ft-drawer-head { display: flex; align-items: center; gap: 14px; margin-top: 6px; margin-bottom: 6px; }
        .ft-drawer-name { font-family: var(--font-display); font-size: 20px; font-weight: 600; }
        .ft-drawer-notes { font-size: 13px; color: var(--text-muted); line-height: 1.5; margin: 14px 0; }
        .ft-drawer-section { margin-top: 18px; }
        .ft-drawer-section-title { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px; }
        .ft-quickadd-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .ft-link-existing-row { margin-top: 8px; }
        .ft-inline-linker { display: flex; flex-direction: column; gap: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px; }
        .ft-picker-dropdown-static { position: static; border: none; max-height: 180px; }
        .ft-drawer-actions { margin-top: 24px; border-top: 1px solid var(--border); padding-top: 16px; justify-content: flex-start; }

        .ft-save-warning { font-size: 12px; color: var(--danger); padding: 6px 24px; }

        @media (max-width: 640px) {
          .ft-header { padding: 16px 16px 12px; }
          .ft-title { font-size: 22px; }
          .ft-search input { width: 130px; }
          .ft-tree-scroll { padding: 20px 16px 32px; }
          .ft-list { padding: 8px 14px 24px; }
          .ft-drawer { max-width: 100%; }
          .ft-row-2 { grid-template-columns: 1fr; }
        }
      `}</style>

      <input type="file" accept="application/json" ref={fileInputRef} onChange={handleImportFile} style={{ display: 'none' }} />

      <div className="ft-header">
        <div>
          <div className="ft-title">Family Tree</div>
          <div className="ft-subtitle">
            {members.length === 0
              ? 'A living record of who belongs to whom.'
              : groupFilter
              ? `${visibleMembers.length} ${visibleMembers.length === 1 ? 'person' : 'people'} in ${groupFilter} · ${members.length} total across all families`
              : `${members.length} ${members.length === 1 ? 'person' : 'people'} across ${genCount} generation${genCount === 1 ? '' : 's'}`}
          </div>
        </div>
        <div className="ft-header-controls">
          <div className="ft-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder="Find a person…"
            />
            {search.trim() && searchFocused && (
              <div className="ft-picker-dropdown ft-search-dropdown">
                {searchMatches.length === 0 && <div className="ft-picker-empty">No matches</div>}
                {searchMatches.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    className="ft-picker-item"
                    onClick={() => {
                      setSelectedId(m.id);
                      setSearch('');
                      setSearchFocused(false);
                    }}
                  >
                    {m.name}
                    {m.dob && <span className="ft-muted-sm"> · b. {formatDate(m.dob)}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {familyGroups.length > 0 && (
            <select className="ft-select" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} title="View one family group, or all combined">
              <option value="">All families (combined)</option>
              {familyGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}
          <div className="ft-view-toggle">
            <button type="button" className={`ft-view-btn${view === 'tree' ? ' ft-view-btn-active' : ''}`} onClick={() => setView('tree')}>
              <GitBranch size={14} /> Tree
            </button>
            <button type="button" className={`ft-view-btn${view === 'list' ? ' ft-view-btn-active' : ''}`} onClick={() => setView('list')}>
              <Rows3 size={14} /> List
            </button>
          </div>
          <button type="button" className="ft-icon-btn" title="Export as JSON" onClick={handleExport}>
            <Download size={15} />
          </button>
          <button type="button" className="ft-icon-btn" title="Import from JSON" onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} />
          </button>
          <button type="button" className="ft-btn ft-btn-primary" onClick={openAdd}>
            <Plus size={15} /> Add person
          </button>
        </div>
      </div>

      {saveError && <div className="ft-save-warning">{saveError}</div>}

      {!loaded ? (
        <div className="ft-loading">Loading your family tree…</div>
      ) : members.length === 0 ? (
        <div className="ft-empty">
          <Users size={30} color="var(--gold)" />
          <h3>Start with one person</h3>
          <p>A grandparent, a parent, or yourself — add the first name, then build outward by adding parents, spouses, and children from there.</p>
          <button type="button" className="ft-btn ft-btn-primary" onClick={openAdd}>
            <Plus size={15} /> Add the first person
          </button>
        </div>
      ) : view === 'tree' ? (
        <TreeView members={visibleMembers} byId={byId} groups={groups} maxLevel={maxLevel} onSelect={setSelectedId} selectedId={selectedId} search={search} />
      ) : (
        <ListView members={visibleMembers} byId={byId} groups={groups} maxLevel={maxLevel} onSelect={setSelectedId} search={search} />
      )}

      {modalOpen && (
        <MemberModal
          members={members}
          editingMember={editingMember}
          presetRelation={presetRelation}
          familyGroups={familyGroups}
          onClose={() => {
            setModalOpen(false);
            setEditingId(null);
            setPresetRelation(null);
          }}
          onSave={handleSave}
        />
      )}

      {selectedMember && !modalOpen && (
        <DetailDrawer
          member={selectedMember}
          members={members}
          byId={byId}
          onClose={() => setSelectedId(null)}
          onEdit={openEdit}
          onDelete={handleDelete}
          onQuickAdd={openAddWithRelation}
          onLinkSpouse={handleLinkSpouse}
          onJump={setSelectedId}
        />
      )}
    </div>
  );
}
