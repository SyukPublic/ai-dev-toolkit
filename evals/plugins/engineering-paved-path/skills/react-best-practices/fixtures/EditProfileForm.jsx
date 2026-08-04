// Fixture for the accessibility case. Two planted violations from SKILL.md's "Accessibility (HIGH)"
// list, plus two things that are already CORRECT and must survive the review — the controls carry the
// discrimination, exactly as in OrderDashboard.jsx.
//
//   PLANTED                                    SKILL RULE
//   icon-only <button><XIcon /></button>       aria-label required on icon-only buttons
//   error <p> beside the input, unassociated   link errors with aria-describedby + aria-invalid
//
//   CORRECT, MUST NOT BE "FIXED"               WHY
//   <button>Save changes</button>              visible text already names it; an aria-label here is
//                                              redundant and can override the visible name
//   <label htmlFor="displayName">              the input already has a programmatic name
import { useState } from 'react';
import { XIcon } from './icons';

export function EditProfileForm({ onClose, onSave }) {
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    if (displayName.trim().length < 2) {
      setError('Display name must be at least 2 characters.');
      return;
    }
    setError('');
    onSave({ displayName });
  }

  return (
    <form onSubmit={handleSubmit}>
      <header>
        <h2>Edit profile</h2>
        <button type="button" onClick={onClose}>
          <XIcon />
        </button>
      </header>

      <label htmlFor="displayName">Display name</label>
      <input
        id="displayName"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
      />
      {error && <p className="field-error">{error}</p>}

      <button type="submit">Save changes</button>
    </form>
  );
}
