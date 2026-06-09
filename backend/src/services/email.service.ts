import nodemailer, { Transporter } from 'nodemailer';

// ── Config from .env ──────────────────────────────────────────────────────
const SMTP_HOST    = process.env.SMTP_HOST    || 'smtp.gmail.com';
const SMTP_PORT    = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER    = process.env.SMTP_USER    || '';
const SMTP_PASS    = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '';
const SMTP_FROM    = process.env.SMTP_FROM    || `"Survey CMS" <${SMTP_USER}>`;
const EMAIL_ENABLED = !!(SMTP_USER && SMTP_PASS);

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:   SMTP_HOST,
      port:   SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth:   { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

// ── Helper: send email ────────────────────────────────────────────────────
async function send(to: string, subject: string, html: string): Promise<void> {
  if (!EMAIL_ENABLED) {
    console.warn(`[Email] NOT configured — would send to ${to}: ${subject}`);
    return;
  }
  try {
    await getTransporter().sendMail({ from: SMTP_FROM, to, subject, html });
    console.info(`[Email] Sent "${subject}" to ${to}`);
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, err);
    // Don't throw — email errors should never block the main flow
  }
}

// ── Base template ─────────────────────────────────────────────────────────
function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:'Inter','Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;min-height:100vh;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(108,99,255,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6C63FF,#FF6584);padding:32px 40px;text-align:center;">
            <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px;">🛡️ Survey CMS</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:6px;">Система управління опитуваннями</div>
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:40px;">${body}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;background:#F4F6FB;text-align:center;border-top:1px solid #E2E8F0;">
            <div style="font-size:12px;color:#94A3B8;">
              Це автоматичне повідомлення від Survey CMS.<br/>
              Якщо ви вважаєте, що це помилка — зверніться до підтримки.
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Email Templates ───────────────────────────────────────────────────────

export async function sendBlockedEmail(params: {
  to: string;
  name: string;
  reason?: string;
  blockedBy: string;
}): Promise<void> {
  const { to, name, reason, blockedBy } = params;
  const body = `
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1A1A2E;">
      ⚠️ Ваш обліковий запис заблоковано
    </h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Привіт, <strong>${name}</strong>!
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Ваш обліковий запис у системі <strong>Survey CMS</strong> було заблоковано адміністратором.
    </p>
    <div style="background:#FFF7ED;border-left:4px solid #F97316;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
      <div style="font-size:13px;color:#9A3412;font-weight:600;margin-bottom:6px;">ПРИЧИНА БЛОКУВАННЯ</div>
      <div style="font-size:15px;color:#7C2D12;">${reason || 'Причину не вказано'}</div>
    </div>
    <div style="background:#F8FAFC;border-radius:8px;padding:16px 20px;margin:0 0 24px;font-size:13px;color:#64748B;">
      <div>Заблокував: <strong>${blockedBy}</strong></div>
      <div>Дата: <strong>${new Date().toLocaleString('uk-UA')}</strong></div>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0;">
      Якщо ви вважаєте, що це сталося помилково — зверніться до адміністратора системи.
    </p>
  `;
  await send(to, '⚠️ Ваш обліковий запис заблоковано — Survey CMS', baseTemplate('Акаунт заблоковано', body));
}

export async function sendUnblockedEmail(params: {
  to: string;
  name: string;
}): Promise<void> {
  const { to, name } = params;
  const body = `
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1A1A2E;">
      ✅ Ваш обліковий запис розблоковано
    </h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Привіт, <strong>${name}</strong>!
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
      Ваш обліковий запис у системі <strong>Survey CMS</strong> було розблоковано.
      Ви можете знову входити в систему та користуватися всіма функціями.
    </p>
    <div style="background:#F0FDF4;border-left:4px solid #22C55E;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <div style="font-size:15px;color:#166534;">🎉 Доступ відновлено ${new Date().toLocaleString('uk-UA')}</div>
    </div>
  `;
  await send(to, '✅ Ваш обліковий запис розблоковано — Survey CMS', baseTemplate('Акаунт розблоковано', body));
}

export async function sendDeletedEmail(params: {
  to: string;
  name: string;
}): Promise<void> {
  const { to, name } = params;
  const body = `
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1A1A2E;">
      🗑️ Ваш обліковий запис видалено
    </h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Привіт, <strong>${name}</strong>!
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Ваш обліковий запис у системі <strong>Survey CMS</strong> було <strong>безповоротно видалено</strong>
      адміністратором системи.
    </p>
    <div style="background:#FFF1F2;border-left:4px solid #F43F5E;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <div style="font-size:13px;color:#9F1239;font-weight:600;margin-bottom:6px;">ВАЖЛИВО</div>
      <div style="font-size:14px;color:#881337;">
        Усі ваші дані, опитування та голоси були видалені.<br/>
        Дата видалення: <strong>${new Date().toLocaleString('uk-UA')}</strong>
      </div>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0;">
      Якщо ви вважаєте, що це сталося помилково — зверніться до підтримки якомога швидше.
    </p>
  `;
  await send(to, '🗑️ Ваш обліковий запис видалено — Survey CMS', baseTemplate('Акаунт видалено', body));
}

export async function sendVerificationCode(params: {
  to: string;
  name: string;
  code: string;
  purpose: 'password' | 'email_old' | 'email_new';
  newEmail?: string;
}): Promise<void> {
  const { to, name, code, purpose, newEmail } = params;

  const titles = {
    password:  '🔑 Підтвердження зміни паролю',
    email_old: '📧 Підтвердження зміни пошти (крок 1/2)',
    email_new: '📧 Підтвердження нової пошти (крок 2/2)',
  };
  const descriptions = {
    password:  'Хтось запросив зміну паролю для вашого облікового запису.',
    email_old: `Хтось запросив зміну електронної пошти на <strong>${newEmail ?? ''}</strong>. Це перший крок підтвердження — зі старої пошти.`,
    email_new: 'Це фінальний крок — підтвердження з нової електронної пошти.',
  };

  const body = `
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1A1A2E;">
      ${titles[purpose]}
    </h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Привіт, <strong>${name}</strong>!
    </p>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
      ${descriptions[purpose]}
    </p>
    <div style="background:linear-gradient(135deg,#6C63FF15,#FF658415);border:2px dashed #6C63FF;border-radius:16px;padding:28px;text-align:center;margin:0 0 24px;">
      <div style="font-size:13px;color:#6C63FF;font-weight:600;letter-spacing:2px;margin-bottom:12px;">КОД ПІДТВЕРДЖЕННЯ</div>
      <div style="font-size:42px;font-weight:900;color:#1A1A2E;letter-spacing:8px;font-family:monospace;">${code}</div>
      <div style="font-size:12px;color:#94A3B8;margin-top:12px;">Код дійсний протягом <strong>15 хвилин</strong></div>
    </div>
    <div style="background:#FFF7ED;border-left:4px solid #F97316;border-radius:8px;padding:14px 18px;font-size:13px;color:#9A3412;">
      ⚠️ Якщо ви не робили цього запиту — проігноруйте цей лист. Ваш пароль залишиться без змін.
    </div>
  `;

  await send(to, `${titles[purpose]} — Survey CMS`, baseTemplate(titles[purpose], body));
}
