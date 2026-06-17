import { DeviceSetupWizard } from '../../../components/device/DeviceSetupWizard'

export default function AddDevicePage() {
  return (
    <div className="page-wrapper">
      <div className="page-content space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Add AscultiCor Device</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/60">
            Connect and configure an ESP32 device for real-time ECG and PCG recording.
          </p>
        </div>

        <section className="rounded-lg border border-[var(--hud-border)] bg-black/20 p-4">
          <div className="grid gap-3 text-sm text-white/75 md:grid-cols-3">
            <p>Use a USB data cable. Some charging-only cables will not detect the ESP32.</p>
            <p>This setup is for real hardware data from AD8232 ECG and MAX9814 PCG sensors. Simulator mode is separate and must not be used as clinical data.</p>
            <p>AscultiCor is for educational and research use only. AI results are not medical diagnoses.</p>
          </div>
        </section>

        <DeviceSetupWizard />
      </div>
    </div>
  )
}

