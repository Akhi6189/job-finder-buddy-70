CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website text,
  careers_url text,
  category text NOT NULL DEFAULT 'Indian',
  hq text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX companies_name_key ON public.companies (lower(name));
GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in can read companies" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed in can add companies" ON public.companies FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Signed in can update companies" ON public.companies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.tracked_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracked_companies TO authenticated;
GRANT ALL ON public.tracked_companies TO service_role;
ALTER TABLE public.tracked_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own tracked" ON public.tracked_companies FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY,
  role_keywords text[] NOT NULL DEFAULT ARRAY['SDET'],
  resume_text text NOT NULL DEFAULT '',
  schedule_hours int[] NOT NULL DEFAULT ARRAY[9,17],
  schedule_enabled boolean NOT NULL DEFAULT true,
  last_scheduled_slot text,
  running_until timestamptz,
  paused_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own settings" ON public.user_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  location text,
  experience text,
  description text,
  score int,
  score_summary text,
  matched_skills text[],
  missing_skills text[],
  status text NOT NULL DEFAULT 'open',
  applied_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, url)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own jobs" ON public.jobs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

INSERT INTO public.companies (name, website, careers_url, category, hq) VALUES
('Tata Consultancy Services','https://www.tcs.com','https://ibegin.tcs.com/iBegin/jobs/search','Indian','Mumbai'),
('Infosys','https://www.infosys.com','https://career.infosys.com/joblist','Indian','Bengaluru'),
('Wipro','https://www.wipro.com','https://careers.wipro.com/careers-home/jobs','Indian','Bengaluru'),
('HCLTech','https://www.hcltech.com','https://www.hcltech.com/careers/careers-in-india','Indian','Noida'),
('Tech Mahindra','https://www.techmahindra.com','https://careers.techmahindra.com/','Indian','Pune'),
('LTIMindtree','https://www.ltimindtree.com','https://www.ltimindtree.com/careers/','Indian','Mumbai'),
('Persistent Systems','https://www.persistent.com','https://careers.persistent.com/','Indian','Pune'),
('Mphasis','https://www.mphasis.com','https://careers.mphasis.com/','Indian','Bengaluru'),
('Coforge','https://www.coforge.com','https://www.coforge.com/careers','Indian','Noida'),
('Zoho','https://www.zoho.com','https://careers.zohocorp.com/jobs/Careers','Indian','Chennai'),
('Freshworks','https://www.freshworks.com','https://careers.freshworks.com/jobs','Indian','Chennai'),
('Flipkart','https://www.flipkart.com','https://www.flipkartcareers.com/#!/joblist','Indian','Bengaluru'),
('Swiggy','https://www.swiggy.com','https://careers.swiggy.com/#/','Indian','Bengaluru'),
('Zomato','https://www.zomato.com','https://www.zomato.com/careers','Indian','Gurugram'),
('Paytm','https://paytm.com','https://jobs.lever.co/paytm','Indian','Noida'),
('PhonePe','https://www.phonepe.com','https://www.phonepe.com/careers/job-openings/','Indian','Bengaluru'),
('Razorpay','https://razorpay.com','https://razorpay.com/jobs/jobs-all/','Indian','Bengaluru'),
('CRED','https://cred.club','https://careers.cred.club/openings','Indian','Bengaluru'),
('Meesho','https://www.meesho.com','https://www.meesho.io/jobs','Indian','Bengaluru'),
('Ola','https://www.olacabs.com','https://www.olacabs.com/careers','Indian','Bengaluru'),
('Zerodha','https://zerodha.com','https://careers.zerodha.com/','Indian','Bengaluru'),
('Groww','https://groww.in','https://groww.in/careers','Indian','Bengaluru'),
('Nykaa','https://www.nykaa.com','https://www.nykaa.com/careers','Indian','Mumbai'),
('BrowserStack','https://www.browserstack.com','https://www.browserstack.com/careers','Indian','Mumbai'),
('Postman','https://www.postman.com','https://www.postman.com/company/careers/open-positions/','Indian','Bengaluru'),
('Dream11','https://www.dream11.com','https://www.dreamsports.group/careers','Indian','Mumbai'),
('InMobi','https://www.inmobi.com','https://www.inmobi.com/company/careers','Indian','Bengaluru'),
('MakeMyTrip','https://www.makemytrip.com','https://careers.makemytrip.com/','Indian','Gurugram'),
('Myntra','https://www.myntra.com','https://careers.myntra.com/','Indian','Bengaluru'),
('Juspay','https://juspay.in','https://juspay.io/careers','Indian','Bengaluru'),
('Chargebee','https://www.chargebee.com','https://www.chargebee.com/careers/','Indian','Chennai'),
('Hasura','https://hasura.io','https://hasura.io/careers','Indian','Bengaluru'),
('Google','https://about.google','https://www.google.com/about/careers/applications/jobs/results/?location=India','Foreign','Mountain View'),
('Microsoft','https://www.microsoft.com','https://jobs.careers.microsoft.com/global/en/search?lc=India','Foreign','Redmond'),
('Amazon','https://www.amazon.jobs','https://www.amazon.jobs/en/locations/india','Foreign','Seattle'),
('Apple','https://www.apple.com','https://jobs.apple.com/en-in/search?location=india-INDC','Foreign','Cupertino'),
('Meta','https://www.metacareers.com','https://www.metacareers.com/jobs?offices[0]=Bangalore%2C%20India','Foreign','Menlo Park'),
('Adobe','https://www.adobe.com','https://careers.adobe.com/us/en/search-results?keywords=india','Foreign','San Jose'),
('Salesforce','https://www.salesforce.com','https://careers.salesforce.com/en/jobs/?country=India','Foreign','San Francisco'),
('Oracle','https://www.oracle.com','https://careers.oracle.com/jobs/#en/sites/jobsearch/requisitions?location=India','Foreign','Austin'),
('SAP Labs India','https://www.sap.com','https://jobs.sap.com/search/?locationsearch=India','Foreign','Walldorf'),
('Atlassian','https://www.atlassian.com','https://www.atlassian.com/company/careers/all-jobs?location=India','Foreign','Sydney'),
('Intuit','https://www.intuit.com','https://jobs.intuit.com/search-jobs/India','Foreign','Mountain View'),
('Uber','https://www.uber.com','https://www.uber.com/in/en/careers/list/?location=IND','Foreign','San Francisco'),
('Walmart Global Tech India','https://tech.walmart.com','https://careers.walmart.com/results?q=&page=1&sort=rank&expand=department,type&jobCity=Bengaluru','Foreign','Bentonville'),
('Goldman Sachs','https://www.goldmansachs.com','https://higher.gs.com/results?LOCATION=Bengaluru','Foreign','New York'),
('JPMorgan Chase','https://www.jpmorganchase.com','https://careers.jpmorgan.com/in/en/home','Foreign','New York'),
('Cisco','https://www.cisco.com','https://jobs.cisco.com/jobs/SearchJobs/?21178=%5B169482%5D','Foreign','San Jose'),
('Thoughtworks','https://www.thoughtworks.com','https://www.thoughtworks.com/careers/jobs?locations=India','Foreign','Chicago'),
('Accenture','https://www.accenture.com','https://www.accenture.com/in-en/careers/jobsearch','Foreign','Dublin'),
('Capgemini','https://www.capgemini.com','https://www.capgemini.com/in-en/careers/job-search/','Foreign','Paris'),
('Cognizant','https://www.cognizant.com','https://careers.cognizant.com/global-en/jobs/?location=India','Foreign','Teaneck'),
('IBM','https://www.ibm.com','https://www.ibm.com/careers/search?field_keyword_05[0]=India','Foreign','Armonk'),
('Ubisoft India','https://www.ubisoft.com','https://www.ubisoft.com/en-us/company/careers/search?countries=in','Foreign','Paris'),
('Electronic Arts','https://www.ea.com','https://jobs.ea.com/en_US/careers/Home/?listFilterMode=1&locations=Hyderabad','Foreign','Redwood City'),
('Rockstar Games India','https://www.rockstargames.com','https://www.rockstargames.com/careers/openings/studio/india','Foreign','New York'),
('Zynga','https://www.zynga.com','https://www.take2games.com/careers/','Foreign','San Mateo'),
('Nvidia','https://www.nvidia.com','https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite?locationHierarchy1=2fcb99c455831013ea52bbe14cf9326c','Foreign','Santa Clara'),
('Qualcomm','https://www.qualcomm.com','https://careers.qualcomm.com/careers?location=India','Foreign','San Diego'),
('Visa','https://www.visa.com','https://corporate.visa.com/en/jobs/?cities=Bangalore','Foreign','San Francisco'),
('PayPal','https://www.paypal.com','https://paypal.eightfold.ai/careers?location=India','Foreign','San Jose'),
('Expedia Group','https://www.expediagroup.com','https://careers.expediagroup.com/jobs/?location=India','Foreign','Seattle'),
('LinkedIn','https://www.linkedin.com','https://www.linkedin.com/jobs/linkedin-jobs-india','Foreign','Sunnyvale');