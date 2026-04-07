/**
 * Init Wizard — 7-step setup flow.
 * Calls aptunnel CLI for auth and env fetching; never re-implements Aptible logic.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import ProgressBar from '../components/ProgressBar.js';
import { useAppContext } from '../state/AppContext.js';
import { useNavigation } from '../hooks/useNavigation.js';
import { ensureAptunnel } from '../services/versionCheck.js';
import { aptunnelConfigExists, loadAptunnelConfig, parseEnvsFromConfig } from '../services/storage.js';
import { spawnInit, spawnLogin } from '../services/aptunnel.js';
import { logger } from '../services/logger.js';
import { Screen, DB_DRIVER_PACKAGES, DbType } from '../constants.js';

const TOTAL_STEPS = 7;

function StepRow({ num, currentStep, label, detail, error }) {
  const done   = num < currentStep;
  const active = num === currentStep;
  const future = num > currentStep;
  return (
    <Box gap={1}>
      {done   && <Text color="green">✔</Text>}
      {active && <Text color="yellow">▶</Text>}
      {future && <Text dimColor>○</Text>}
      <Text dimColor={future} bold={active}>{num}. {label}</Text>
      {detail && <Text dimColor color={error ? 'red' : undefined}>{detail}</Text>}
    </Box>
  );
}

export default function InitWizard() {
  const { state, dispatch } = useAppContext();
  const { replace } = useNavigation();
  const [step, setStep] = useState(1);
  const [stepDetails, setStepDetails] = useState({});
  const [stepErrors, setStepErrors] = useState({});
  const [skipConfirm, setSkipConfirm] = useState(false);       // step 2: existing config found
  const [driverList, setDriverList] = useState([]);            // step 6: which drivers to install
  const [driverProgress, setDriverProgress] = useState({});   // step 7: per-driver status
  const [done, setDone] = useState(false);
  const running = useRef(false);

  const setDetail = (s, d) => setStepDetails(prev => ({ ...prev, [s]: d }));
  const setError  = (s, e) => setStepErrors(prev => ({ ...prev, [s]: e }));

  // Handle skip confirm input (step 2)
  useInput((input, key) => {
    if (step === 2 && skipConfirm) {
      if (input === 'y' || input === 'Y' || key.return) {
        setSkipConfirm(false);
        runFromStep(6);
      } else if (input === 'n' || input === 'N') {
        setSkipConfirm(false);
        runFromStep(3);
      }
    }
    if (done && key.return) {
      dispatch({ type: 'SET_INITIALIZED', value: true });
      replace(Screen.DASHBOARD);
    }
  });

  useEffect(() => {
    if (!running.current) {
      running.current = true;
      runFromStep(1);
    }
  }, []);

  async function runFromStep(fromStep) {
    setStep(fromStep);
    try {
      // Step 1 — aptunnel check
      if (fromStep <= 1) {
        setStep(1);
        await ensureAptunnel((msg) => setDetail(1, msg));
        setDetail(1, 'OK');
      }

      // Step 2 — config check
      if (fromStep <= 2) {
        setStep(2);
        const exists = await aptunnelConfigExists();
        if (exists) {
          setDetail(2, 'Existing config found. Skip init? [Y/n]');
          setSkipConfirm(true);
          return; // wait for user input — useInput resumes
        }
        setDetail(2, 'No config found');
      }

      // Step 3 — aptible login
      if (fromStep <= 3) {
        setStep(3);
        setDetail(3, 'Launching aptunnel login…');
        try {
          const proc = spawnLogin();
          let output = '';
          proc.all?.on('data', (d) => { output += d.toString(); });
          await proc;
          const emailMatch = output.match(/authenticated as\s+([\S]+)/i);
          setDetail(3, emailMatch ? `authenticated as ${emailMatch[1]}` : 'authenticated');
          logger.info(`aptunnel login completed`);
        } catch (err) {
          setError(3, err.message);
          logger.error(`aptunnel login failed: ${err.message}`);
          // Don't abort — user may already be logged in
          setDetail(3, 'skipped (may already be authenticated)');
        }
      }

      // Step 4 — fetch envs + DBs (run aptunnel init, stream output)
      if (fromStep <= 4) {
        setStep(4);
        setDetail(4, 'Running aptunnel init…');
        try {
          const proc = spawnInit();
          let output = '';
          proc.all?.on('data', (chunk) => {
            output += chunk.toString();
            // Show last non-empty line as progress
            const lines = output.split('\n').filter(l => l.trim());
            if (lines.length) setDetail(4, lines[lines.length - 1].trim().slice(0, 60));
          });
          await proc;
          setDetail(4, 'init complete');
          logger.info('aptunnel init completed');
        } catch (err) {
          setError(4, err.message);
          logger.error(`aptunnel init failed: ${err.message}`);
          setDetail(4, `error: ${err.message.slice(0, 50)}`);
        }
      }

      // Step 5 — assign aliases & ports (read config, display summary)
      if (fromStep <= 5) {
        setStep(5);
        const config = await loadAptunnelConfig();
        const envs = config ? parseEnvsFromConfig(config) : [];
        const summary = envs.map(e => `${e.envAlias}(${e.dbs.length})`).join(', ') || 'none';
        setDetail(5, `envs: ${summary}`);
        dispatch({ type: 'SET_ENVS', envs });
        logger.info(`Loaded ${envs.length} environments from config`);
      }

      // Step 6 — detect DB types + determine needed drivers
      if (fromStep <= 6) {
        setStep(6);
        const config = await loadAptunnelConfig();
        const envs = config ? parseEnvsFromConfig(config) : [];
        const types = new Set();
        for (const env of envs) for (const db of env.dbs) types.add(db.type);
        const needed = [...types].map(t => DB_DRIVER_PACKAGES[t]).filter(Boolean);
        const unique = [...new Set(needed)];
        setDriverList(unique);
        setDetail(6, unique.length ? `will install: ${unique.join(', ')}` : 'no drivers needed');
      }

      // Step 7 — install drivers
      if (fromStep <= 7) {
        setStep(7);
        if (driverList.length === 0) {
          setDetail(7, 'no drivers to install');
        } else {
          for (const pkg of driverList) {
            setDriverProgress(prev => ({ ...prev, [pkg]: 'installing' }));
            try {
              const { execa } = await import('execa');
              await execa('npm', ['install', pkg]);
              setDriverProgress(prev => ({ ...prev, [pkg]: 'done' }));
              logger.info(`Driver installed: ${pkg}`);
            } catch (err) {
              setDriverProgress(prev => ({ ...prev, [pkg]: 'failed' }));
              logger.error(`Driver install failed: ${pkg} — ${err.message}`);
            }
          }
          setDetail(7, 'drivers installed');
        }
      }

      setDone(true);
    } catch (err) {
      logger.error(`Init wizard error: ${err.message}`);
    }
  }

  const labels = [
    'aptunnel check',
    'config check',
    'aptible login',
    'fetch envs + DBs',
    'assign aliases & ports',
    'detect DB types',
    'install drivers',
  ];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={0}>
      <Text bold color="cyan"> aptunnel-gui — Setup Wizard</Text>
      <Text> </Text>

      {labels.map((label, i) => {
        const n = i + 1;
        return (
          <StepRow
            key={n}
            num={n}
            currentStep={step}
            label={label}
            detail={stepDetails[n]}
            error={!!stepErrors[n]}
          />
        );
      })}

      {/* Step 2 skip prompt */}
      {step === 2 && skipConfirm && (
        <Box marginLeft={3} marginTop={1}>
          <Text color="yellow">Existing config found. Skip init? [Y/n] </Text>
        </Box>
      )}

      {/* Step 7 driver progress */}
      {step === 7 && driverList.length > 0 && (
        <Box flexDirection="column" marginLeft={3} marginTop={1} gap={0}>
          {driverList.map(pkg => (
            <Box key={pkg} gap={1}>
              {driverProgress[pkg] === 'done'       && <Text color="green">✔</Text>}
              {driverProgress[pkg] === 'failed'     && <Text color="red">✖</Text>}
              {driverProgress[pkg] === 'installing' && <Text color="yellow">…</Text>}
              {!driverProgress[pkg]                 && <Text dimColor>○</Text>}
              <Text>{pkg}</Text>
            </Box>
          ))}
        </Box>
      )}

      <Text> </Text>
      <ProgressBar current={done ? TOTAL_STEPS : Math.min(step - 1, TOTAL_STEPS)} total={TOTAL_STEPS} width={24} />

      {done && (
        <Box flexDirection="column" marginTop={1} gap={0}>
          <Text color="green" bold>✔ Setup complete!</Text>
          <Text dimColor>[Enter] Launch Dashboard</Text>
        </Box>
      )}
    </Box>
  );
}
