import Table from 'react-bootstrap/Table'
import { Link } from 'react-router'
import AppointmentStatus from './AppointmentStatus.jsx'
import ArchivedLabel from '../../../components/ui/ArchivedLabel.jsx'
import { formatClinicDate, formatClinicTimeRange } from '../../../lib/clinicTime.js'

export default function AppointmentTable({ records, backTo }) {
  return <div className="table-scroll" role="region" aria-label="Appointments table, scroll horizontally for all columns" tabIndex={0}>
    <Table className="directory-table appointment-table"><caption className="visually-hidden">Clinic appointments. All times are in Manila time.</caption><thead><tr><th scope="col">Date and time</th><th scope="col">Patient</th><th scope="col">Doctor</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead><tbody>{records.map((record) => <tr key={record.id}>
      <th scope="row"><Link to={`/appointments/${record.id}`} state={{ backTo }} className="record-name">{formatClinicDate(record.startsAt)}</Link><span className="record-meta">{formatClinicTimeRange(record.startsAt, record.endsAt)}</span></th>
      <td><span className="table-record-label">{record.patient?.name || 'Patient unavailable'}</span><span className="record-meta">{record.patient?.patientId}{record.patient?.archivedAt && <> · <ArchivedLabel /></>}</span></td>
      <td><span className="table-record-label">{record.doctor?.name || 'Doctor unavailable'}</span><span className="record-meta">{record.doctor?.specialty}{record.doctor?.archivedAt && <> · <ArchivedLabel /></>}</span></td>
      <td><AppointmentStatus status={record.status} /></td><td><Link className="inline-action" to={`/appointments/${record.id}`} state={{ backTo }} aria-label={`View appointment for ${record.patient?.name || 'unavailable patient'}`}>View</Link></td>
    </tr>)}</tbody></Table>
  </div>
}
