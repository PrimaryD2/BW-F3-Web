import React, { useState } from "react";

export function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="ghost-button" onClick={onClose}>Close</button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function PasswordConfirm({ title, actionLabel, onSubmit, onClose }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    try {
      await onSubmit(password);
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label>Password confirmation<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error ? <div className="error-message">{error}</div> : null}
        <button className="primary-button" type="submit">{actionLabel}</button>
      </form>
    </Modal>
  );
}
