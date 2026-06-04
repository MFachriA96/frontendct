import AppButton from './AppButton';
import BaseModalShell from './BaseModalShell';

const iconByIntent = {
  danger: 'fa-solid fa-triangle-exclamation',
  info: 'fa-solid fa-circle-question',
  warning: 'fa-solid fa-triangle-exclamation',
};

const ConfirmModal = ({
  cancelLabel = 'Cancel',
  confirmLabel = 'Continue',
  intent = 'warning',
  message,
  onCancel,
  onConfirm,
  open,
  title,
}) => (
  <BaseModalShell open={open} onClose={onCancel} panelClassName="ui-modal-shell--confirm">
    <div className={`ui-modal-status ui-modal-status--${intent}`}>
      <div className="ui-modal-status__icon ui-modal-status__icon--confirm">
        <i className={iconByIntent[intent] || iconByIntent.warning}></i>
      </div>
      <div className="ui-modal-status__copy">
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
      <div className="ui-modal-status__actions">
        <AppButton type="button" variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </AppButton>
        <AppButton type="button" onClick={onConfirm}>
          {confirmLabel}
        </AppButton>
      </div>
    </div>
  </BaseModalShell>
);

export default ConfirmModal;
