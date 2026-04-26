import React from 'react';

export default function ConfirmDialog({ isOpen, title, message, confirmLabel = 'Confirm', confirmClass = 'btn btn-danger', onConfirm, onCancel }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{message}</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={confirmClass} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
