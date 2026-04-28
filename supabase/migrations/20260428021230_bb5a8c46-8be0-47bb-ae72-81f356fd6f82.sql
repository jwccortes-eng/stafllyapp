DELETE FROM public.employee_onboarding_documents
 WHERE employee_id = '340db246-c365-4e56-9e9a-ac7d4ef56bc4'
   AND document_type IN ('driver_license','vehicle_registration')
   AND file_url IN ('340db246-c365-4e56-9e9a-ac7d4ef56bc4/driver_license.jpg',
                    '340db246-c365-4e56-9e9a-ac7d4ef56bc4/vehicle_registration.jpg');