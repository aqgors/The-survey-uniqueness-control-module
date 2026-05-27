import { useState, useRef, useEffect, useCallback } from 'react';
import { profileApi } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

// @ts-ignore
const API = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

// ── Step type for email change ─────────────────────────────────────────────
type EmailStep = 'idle' | 'enterNew' | 'confirmOld' | 'confirmNew' | 'done';
type PwStep    = 'idle' | 'codeSent' | 'done';

// ── Small OTP Input ────────────────────────────────────────────────────────
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="000000"
      maxLength={6}
      style={{
        textAlign: 'center', letterSpacing: '12px', fontSize: '28px', fontWeight: 700,
        fontFamily: 'monospace', padding: '14px 20px', border: '2px solid #6C63FF',
        borderRadius: '12px', outline: 'none', width: '100%', background: 'transparent',
        color: 'inherit', boxSizing: 'border-box',
      }}
    />
  );
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth() as any;
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading]  = useState(true);

  // Name editing
  const [editName, setEditName] = useState(false);
  const [nameVal,  setNameVal]  = useState('');

  // Avatar
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);

  // Password change
  const [pwStep,    setPwStep]    = useState<PwStep>('idle');
  const [pwCode,    setPwCode]    = useState('');
  const [pwNew,     setPwNew]     = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // Email change
  const [emailStep,    setEmailStep]    = useState<EmailStep>('idle');
  const [newEmailVal,  setNewEmailVal]  = useState('');
  const [emailCode,    setEmailCode]    = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await profileApi.getMe();
      setProfile(data.user);
      setNameVal(data.user.name);
    } catch {
      toast.error(t('toast.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  // ── Avatar ─────────────────────────────────────────────────────────────────
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await profileApi.uploadAvatar(fd);
      setProfile((p: any) => ({ ...p, avatarUrl: data.avatarUrl }));
      if (updateUser) updateUser({ avatarUrl: data.avatarUrl });
      toast.success(t('profile.avatarUpdated'));
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? t('profile.avatarLoadError'));
    } finally {
      setAvatarLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ── Name ───────────────────────────────────────────────────────────────────
  const handleSaveName = async () => {
    if (!nameVal.trim()) return;
    try {
      await profileApi.updateName(nameVal.trim());
      setProfile((p: any) => ({ ...p, name: nameVal.trim() }));
      if (updateUser) updateUser({ name: nameVal.trim() });
      setEditName(false);
      toast.success(t('profile.nameUpdated'));
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? t('profile.defaultError'));
    }
  };

  // ── Password flow ──────────────────────────────────────────────────────────
  const handleRequestPw = async () => {
    setPwLoading(true);
    try {
      await profileApi.requestPassword();
      setPwStep('codeSent');
      toast.success(t('profile.codeSent'));
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? t('profile.defaultError'));
    } finally {
      setPwLoading(false);
    }
  };

  const handleConfirmPw = async () => {
    if (pwNew !== pwConfirm) { toast.error(t('profile.passwordsMismatch')); return; }
    if (pwNew.length < 6)    { toast.error(t('profile.defaultError')); return; }
    setPwLoading(true);
    try {
      await profileApi.confirmPassword(pwCode, pwNew);
      setPwStep('done');
      setPwCode(''); setPwNew(''); setPwConfirm('');
      toast.success(t('profile.passwordChanged'));
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? t('profile.invalidCode'));
    } finally {
      setPwLoading(false);
    }
  };

  // ── Email flow ─────────────────────────────────────────────────────────────
  const handleRequestEmail = async () => {
    setEmailLoading(true);
    try {
      await profileApi.requestEmailChange(newEmailVal);
      setEmailStep('confirmOld');
      toast.success(t('profile.codeSentToOld'));
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? t('profile.defaultError'));
    } finally {
      setEmailLoading(false);
    }
  };

  const handleConfirmOldEmail = async () => {
    setEmailLoading(true);
    try {
      await profileApi.confirmOldEmail(emailCode);
      setEmailCode('');
      setEmailStep('confirmNew');
      toast.success(t('profile.codeSentToNew'));
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? t('profile.invalidCode'));
    } finally {
      setEmailLoading(false);
    }
  };

  const handleConfirmNewEmail = async () => {
    setEmailLoading(true);
    try {
      const { data } = await profileApi.confirmNewEmail(emailCode);
      setProfile((p: any) => ({ ...p, email: data.newEmail }));
      if (updateUser) updateUser({ email: data.newEmail });
      setEmailStep('done');
      setEmailCode(''); setNewEmailVal('');
      toast.success(t('profile.emailChanged'));
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? t('profile.invalidCode'));
    } finally {
      setEmailLoading(false);
    }
  };

  // ── Language ───────────────────────────────────────────────────────────────
  const toggleLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
    toast.success(t('profile.langChanged'));
  };

  // ── Avatar URL ─────────────────────────────────────────────────────────────
  const avatarSrc = profile?.avatarUrl ? `${API}${profile.avatarUrl}` : null;
  const initials  = profile?.name?.[0]?.toUpperCase() ?? '?';

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 48, height: 48, border: '4px solid #6C63FF30', borderTop: '4px solid #6C63FF', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }`}</style>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 4px', color: 'var(--color-primary, #6C63FF)' }}>{t('profile.title')}</h1>
        <p style={{ color: 'var(--color-textMuted, #94A3B8)', margin: 0 }}>{t('profile.subtitle')}</p>
      </div>

      {/* ── Avatar + Identity card ───────────────────────────────── */}
      <Card style={{ marginBottom: 24, animation: 'fadeIn 0.3s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 96, height: 96, borderRadius: '50%', overflow: 'hidden',
              background: 'linear-gradient(135deg, #6C63FF, #FF6584)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, fontWeight: 800, color: '#fff', border: '3px solid #6C63FF',
            }}>
              {avatarSrc ? <img src={avatarSrc} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={avatarLoading}
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 28, height: 28, borderRadius: '50%',
                background: '#6C63FF', border: '2px solid white',
                color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, transition: 'transform 0.2s',
              }}
              title={t('profile.avatarUpdated')}
            >
              {avatarLoading ? '⏳' : '📷'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
          </div>

          {/* Name & email */}
          <div style={{ flex: 1, minWidth: 200 }}>
            {editName ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <input
                  value={nameVal} onChange={e => setNameVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditName(false); }}
                  style={{ ...inputStyle, fontSize: 18, fontWeight: 700, flex: 1 }}
                  autoFocus
                />
                <Btn onClick={handleSaveName} small>✓</Btn>
                <Btn onClick={() => setEditName(false)} small ghost>✕</Btn>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 800 }}>{profile?.name}</span>
                <button onClick={() => setEditName(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.6, padding: 0 }} title={t('profile.nameEditLabel')}>✏️</button>
              </div>
            )}
            <div style={{ color: 'var(--color-textMuted, #94A3B8)', fontSize: 14, marginBottom: 6 }}>{profile?.email}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge color={profile?.role === 'ADMIN' ? '#EF4444' : profile?.role === 'MODERATOR' ? '#F97316' : '#6C63FF'}>{profile?.role}</Badge>
              <Badge color="#64748B">ID: {profile?.id?.slice(0, 16)}…</Badge>
            </div>
          </div>

          {/* Stats */}
          <div style={{ textAlign: 'right', minWidth: 100 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#6C63FF' }}>{profile?._count?.votes ?? 0}</div>
            <div style={{ fontSize: 12, color: 'var(--color-textMuted, #94A3B8)' }}>{t('profile.votes')}</div>
            <div style={{ fontSize: 11, color: 'var(--color-textMuted, #94A3B8)', marginTop: 4 }}>
              {t('profile.since', { date: profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'uk-UA') : '—' })}
            </div>
          </div>
        </div>

        {/* Full ID row */}
        <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(108,99,255,0.06)', borderRadius: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--color-textMuted, #94A3B8)', fontWeight: 600 }}>{t('profile.idLabel')}</span>
          <code style={{ fontSize: 12, letterSpacing: 0.5, color: '#6C63FF', wordBreak: 'break-all' }}>{profile?.id}</code>
        </div>
      </Card>

      {/* ── Language settings ─────────────────────────────────────── */}
      <Card style={{ marginBottom: 24 }}>
        <SectionTitle icon="🌍" title={t('profile.languageTitle')} />
        <p style={{ color: 'var(--color-textMuted, #94A3B8)', fontSize: 14, margin: '0 0 16px' }}>
          {t('profile.languageDesc')}
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <Btn ghost={i18n.language !== 'ua'} onClick={() => toggleLanguage('ua')}>{t('profile.langUa')}</Btn>
          <Btn ghost={i18n.language !== 'en'} onClick={() => toggleLanguage('en')}>{t('profile.langEn')}</Btn>
        </div>
      </Card>

      {/* ── Change Password ─────────────────────────────────────── */}
      <Card style={{ marginBottom: 24 }}>
        <SectionTitle icon="🔑" title={t('profile.passwordTitle')} />

        {pwStep === 'idle' && (
          <>
            <p style={{ color: 'var(--color-textMuted, #94A3B8)', fontSize: 14, margin: '0 0 16px' }}
               dangerouslySetInnerHTML={{ __html: t('profile.passwordDesc', { email: profile?.email }) }}
            />
            <Btn onClick={handleRequestPw} loading={pwLoading}>{t('profile.sendCode')}</Btn>
          </>
        )}

        {pwStep === 'codeSent' && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <InfoBox><span dangerouslySetInnerHTML={{ __html: t('profile.codeInstruction', { email: profile?.email }) }} /></InfoBox>
            <div style={{ marginBottom: 16 }}>
              <Label>{t('profile.verificationCode')}</Label>
              <OtpInput value={pwCode} onChange={setPwCode} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <Label>{t('profile.newPassword')}</Label>
              <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder={t('profile.passwordPlaceholder')} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <Label>{t('profile.confirmPassword')}</Label>
              <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder={t('profile.confirmPassword')} style={{ ...inputStyle, borderColor: pwConfirm && pwNew !== pwConfirm ? '#EF4444' : undefined }} />
              {pwConfirm && pwNew !== pwConfirm && <span style={{ color: '#EF4444', fontSize: 12 }}>{t('profile.passwordsMismatch')}</span>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn onClick={handleConfirmPw} loading={pwLoading} disabled={pwCode.length < 6 || pwNew.length < 6 || pwNew !== pwConfirm}>{t('profile.changePasswordBtn')}</Btn>
              <Btn ghost onClick={() => { setPwStep('idle'); setPwCode(''); setPwNew(''); setPwConfirm(''); }}>{t('common.cancel')}</Btn>
            </div>
          </div>
        )}

        {pwStep === 'done' && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <SuccessBox>{t('profile.passwordChanged')}</SuccessBox>
            <Btn ghost onClick={() => setPwStep('idle')} style={{ marginTop: 12 }}>{t('profile.changeAgain')}</Btn>
          </div>
        )}
      </Card>

      {/* ── Change Email ────────────────────────────────────────── */}
      <Card style={{ marginBottom: 24 }}>
        <SectionTitle icon="📧" title={t('profile.emailTitle')} />

        {emailStep === 'idle' && (
          <>
            <p style={{ color: 'var(--color-textMuted, #94A3B8)', fontSize: 14, margin: '0 0 16px' }}>
              {t('profile.emailDesc')}
            </p>
            <div style={{ marginBottom: 16 }}>
              <Label>{t('profile.newEmailLabel')}</Label>
              <input type="email" value={newEmailVal} onChange={e => setNewEmailVal(e.target.value)} placeholder={t('profile.newEmailPlaceholder')} style={inputStyle} />
              {newEmailVal && newEmailVal === profile?.email && (
                <span style={{ color: '#EF4444', fontSize: 12, marginTop: 4, display: 'block' }}>{t('profile.sameEmailError')}</span>
              )}
            </div>
            <Btn onClick={handleRequestEmail} loading={emailLoading} disabled={!newEmailVal.includes('@') || newEmailVal === profile?.email}>{t('profile.step1Btn')}</Btn>
          </>
        )}

        {emailStep === 'confirmOld' && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <StepIndicator current={1} />
            <InfoBox><span dangerouslySetInnerHTML={{ __html: t('profile.step1Instruction', { email: profile?.email }) }} /></InfoBox>
            <div style={{ marginBottom: 20 }}>
              <Label>{t('profile.oldEmailCodeLabel')}</Label>
              <OtpInput value={emailCode} onChange={setEmailCode} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn onClick={handleConfirmOldEmail} loading={emailLoading} disabled={emailCode.length < 6}>{t('common.confirm')}</Btn>
              <Btn ghost onClick={() => { setEmailStep('idle'); setEmailCode(''); setNewEmailVal(''); }}>{t('common.cancel')}</Btn>
            </div>
          </div>
        )}

        {emailStep === 'confirmNew' && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <StepIndicator current={2} />
            <InfoBox><span dangerouslySetInnerHTML={{ __html: t('profile.step2Instruction', { email: newEmailVal }) }} /></InfoBox>
            <div style={{ marginBottom: 20 }}>
              <Label>{t('profile.newEmailCodeLabel')}</Label>
              <OtpInput value={emailCode} onChange={setEmailCode} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn onClick={handleConfirmNewEmail} loading={emailLoading} disabled={emailCode.length < 6}>{t('profile.confirmNewBtn')}</Btn>
              <Btn ghost onClick={() => { setEmailStep('idle'); setEmailCode(''); setNewEmailVal(''); }}>{t('common.cancel')}</Btn>
            </div>
          </div>
        )}

        {emailStep === 'done' && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <SuccessBox>{t('profile.emailChanged')}</SuccessBox>
            <Btn ghost onClick={() => setEmailStep('idle')} style={{ marginTop: 12 }}>{t('profile.changeAgain')}</Btn>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Small UI components ────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--color-surface, #fff)',
      border: '1px solid var(--color-borderLight, #E2E8F0)',
      borderRadius: 16, padding: '24px',
      boxShadow: '0 2px 12px rgba(108,99,255,0.06)',
      ...style,
    }}>{children}</div>
  );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--color-textMuted, #64748B)' }}>{children}</div>;
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
      background: `${color}18`, color, border: `1px solid ${color}40`,
    }}>{children}</span>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)',
      borderRadius: 10, padding: '12px 16px', fontSize: 14,
      marginBottom: 16, color: 'var(--color-textMain, #1A1A2E)',
    }}>{children}</div>
  );
}

function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
      borderRadius: 10, padding: '14px 18px', fontSize: 15, fontWeight: 600,
      color: '#166534',
    }}>{children}</div>
  );
}

function StepIndicator({ current }: { current: number }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      {[1, 2].map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13,
            background: s <= current ? '#6C63FF' : 'rgba(108,99,255,0.12)',
            color: s <= current ? '#fff' : '#6C63FF',
          }}>{s}</div>
          {i < 1 && <div style={{ width: 32, height: 2, background: current >= 2 ? '#6C63FF' : 'rgba(108,99,255,0.2)', borderRadius: 2 }} />}
        </div>
      ))}
      <span style={{ fontSize: 13, color: 'var(--color-textMuted, #94A3B8)', marginLeft: 4 }}>{t('profile.stepNofM', { current })}</span>
    </div>
  );
}

function Btn({ children, onClick, loading, disabled, ghost, small, style }: {
  children: React.ReactNode;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  ghost?: boolean;
  small?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      style={{
        padding: small ? '6px 14px' : '10px 22px',
        borderRadius: 10, fontSize: small ? 13 : 14, fontWeight: 700,
        cursor: loading || disabled ? 'not-allowed' : 'pointer',
        opacity: disabled && !loading ? 0.5 : 1,
        transition: 'all 0.2s',
        border: ghost ? '1.5px solid var(--color-borderLight, #E2E8F0)' : 'none',
        background: ghost ? 'transparent' : 'linear-gradient(135deg, #6C63FF, #9C59FF)',
        color: ghost ? 'var(--color-textMuted, #64748B)' : '#fff',
        ...style,
      }}
    >
      {loading ? '⏳ ' : ''}{children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: '1.5px solid var(--color-borderLight, #E2E8F0)',
  background: 'transparent', color: 'inherit', fontSize: 14,
  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
};
