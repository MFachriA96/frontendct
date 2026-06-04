import AppButton from './AppButton';
import BaseModalShell from './BaseModalShell';

const iconByType = {
  error: 'fa-solid fa-xmark',
  info: 'fa-solid fa-info',
  success: 'fa-solid fa-check',
  warning: 'fa-solid fa-exclamation',
};

const StatusModal = ({
  actionLabel = 'Close',
  message,
  onClose,
  open,
  title,
  type = 'info',
}) => (
  <BaseModalShell open={open} onClose={onClose} panelClassName="ui-modal-shell--status">
    <div className={`ui-modal-status ui-modal-status--${type}`}>
      <div className="ui-modal-status__icon">
        <span className="ui-modal-status__pulse"></span>
        <i className={iconByType[type] || iconByType.info}></i>
      </div>
      <div className="ui-modal-status__copy">
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
      <div className="ui-modal-status__actions ui-modal-status__actions--single">
        <AppButton type="button" onClick={onClose}>
          {actionLabel}
        </AppButton>
      </div>
    </div>
  </BaseModalShell>
);

export default StatusModal;
