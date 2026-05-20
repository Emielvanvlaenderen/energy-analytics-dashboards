const TEMPLATE_PATH = '/templates/site-power-profile-template.csv'

const TEMPLATE_FILES = {
  consumption: 'site_consumption_upload_template.csv',
  pv: 'site_pv_generation_upload_template.csv',
  other: 'site_other_generation_upload_template.csv',
}

export function SiteDataUploadHint({ kind = 'consumption' }) {
  const filename = TEMPLATE_FILES[kind] ?? TEMPLATE_FILES.consumption

  return (
    <div className="site-data-upload-hint">
      <p className="panel__hint site-data-upload-hint__text">
        CSV format: half-hourly rows from 2024 through the last completed
        half-hour. Columns{' '}
        <code>Datetime (UTC)</code>, <code>Datetime (Local)</code>, and{' '}
        <code>Power (MW)</code> (site power in megawatts). Download the
        example template, fill in <code>Power (MW)</code>, then upload.
      </p>
      <a
        className="btn btn--ghost site-data-upload-hint__download"
        href={TEMPLATE_PATH}
        download={filename}
      >
        Download example CSV
      </a>
    </div>
  )
}
