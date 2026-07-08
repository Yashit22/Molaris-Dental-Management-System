import { PatientSchema }            from '../models/Patient.model.js';
import { VisitSchema }              from '../models/Visit.model.js';
import { AppointmentSchema }        from '../models/Appointment.model.js';
import { InvoiceSchema }            from '../models/Invoice.model.js';
import { LabCatalogItemSchema }     from '../models/LabCatalogItem.model.js';
import { LabOrderSchema }           from '../models/LabOrder.model.js';
import { VendorSchema }             from '../models/Vendor.model.js';
import DoctorModel                  from '../models/Doctor.model.js';
import ClinicalFindingModel         from '../models/ClinicalFinding.model.js';
import DiagnosisModel               from '../models/Diagnosis.model.js';
import SuggestedTreatmentModel      from '../models/SuggestedTreatment.model.js';
import MedicineModel                from '../models/Medicine.model.js';
import { WhatsAppSettingsSchema }   from '../models/WhatsAppSettings.model.js';
import { WhatsAppTemplateSchema }   from '../models/WhatsAppTemplate.model.js';
import { WhatsAppMediaSchema }      from '../models/WhatsAppMedia.model.js';
import { WhatsAppLogSchema }        from '../models/WhatsAppLog.model.js';
import { TreatmentJourneySchema }   from '../models/TreatmentJourney.model.js';
import { PollResponseSchema }       from '../models/PollResponse.model.js';

import { PollTemplateSchema }       from '../models/PollTemplate.model.js';
import { EmailSettingsSchema }      from '../models/EmailSettings.model.js';
import { EmailTemplateSchema }      from '../models/EmailTemplate.model.js';
import { EmailLogSchema }           from '../models/EmailLog.model.js';
import { ReportJobSchema }          from '../models/ReportJob.model.js';
import { ReportDeliverySettingsSchema } from '../models/ReportDeliverySettings.model.js';
import { ClinicProfileSchema }      from '../models/ClinicProfile.model.js';
import { BookingSettingsSchema }    from '../models/BookingSettings.model.js';
import { InvoiceSettingsSchema }    from '../models/InvoiceSettings.model.js';
import { PrescriptionSettingsSchema } from '../models/PrescriptionSettings.model.js';
import { DocumentSettingsSchema }    from '../models/DocumentSettings.model.js';
import { IntegrationStatusSchema }   from '../models/IntegrationStatus.model.js';

/**
 * Returns all clinic Mongoose models bound to the given tenant connection.
 * Caches the result on conn._dmsModels to avoid re-registering schemas.
 */
export function getTenantModels(conn) {
  if (conn._dmsModels) return conn._dmsModels;

  const getOrCreate = (name, schema) =>
    conn.modelNames().includes(name) ? conn.model(name) : conn.model(name, schema);

  conn._dmsModels = {
    Patient:         getOrCreate('Patient',         PatientSchema),
    Visit:           getOrCreate('Visit',           VisitSchema),
    Appointment:     getOrCreate('Appointment',     AppointmentSchema),
    Invoice:         getOrCreate('Invoice',         InvoiceSchema),
    LabCatalogItem:  getOrCreate('LabCatalogItem',  LabCatalogItemSchema),
    LabOrder:        getOrCreate('LabOrder',        LabOrderSchema),
    Vendor:          getOrCreate('Vendor',          VendorSchema),
    Doctor:          getOrCreate('Doctor',          DoctorModel.schema),
    ClinicalFinding:    getOrCreate('ClinicalFinding',    ClinicalFindingModel.schema),
    Diagnosis:          getOrCreate('Diagnosis',          DiagnosisModel.schema),
    SuggestedTreatment: getOrCreate('SuggestedTreatment', SuggestedTreatmentModel.schema),
    Medicine:           getOrCreate('Medicine',           MedicineModel.schema),
    WhatsAppSettings:   getOrCreate('WhatsAppSettings',   WhatsAppSettingsSchema),
    WhatsAppTemplate:   getOrCreate('WhatsAppTemplate',   WhatsAppTemplateSchema),
    WhatsAppMedia:      getOrCreate('WhatsAppMedia',      WhatsAppMediaSchema),
    WhatsAppLog:        getOrCreate('WhatsAppLog',        WhatsAppLogSchema),
    TreatmentJourney:   getOrCreate('TreatmentJourney',   TreatmentJourneySchema),
    PollResponse:       getOrCreate('PollResponse',       PollResponseSchema),

    PollTemplate:       getOrCreate('PollTemplate',       PollTemplateSchema),
    EmailSettings:      getOrCreate('EmailSettings',      EmailSettingsSchema),
    EmailTemplate:      getOrCreate('EmailTemplate',      EmailTemplateSchema),
    EmailLog:           getOrCreate('EmailLog',           EmailLogSchema),
    ReportJob:                getOrCreate('ReportJob',                ReportJobSchema),
    ReportDeliverySettings:   getOrCreate('ReportDeliverySettings',   ReportDeliverySettingsSchema),
    ClinicProfile:            getOrCreate('ClinicProfile',            ClinicProfileSchema),
    BookingSettings:          getOrCreate('BookingSettings',          BookingSettingsSchema),
    InvoiceSettings:          getOrCreate('InvoiceSettings',          InvoiceSettingsSchema),
    PrescriptionSettings:     getOrCreate('PrescriptionSettings',     PrescriptionSettingsSchema),
    DocumentSettings:         getOrCreate('DocumentSettings',         DocumentSettingsSchema),
    IntegrationStatus:        getOrCreate('IntegrationStatus',        IntegrationStatusSchema),
  };

  return conn._dmsModels;
}
