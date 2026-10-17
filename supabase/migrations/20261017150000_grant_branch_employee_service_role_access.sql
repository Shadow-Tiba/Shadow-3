-- Grant only the reads and insert needed by create-branch-employee.
GRANT SELECT, INSERT ON TABLE public.app_users TO service_role;
GRANT SELECT ON TABLE public.offices TO service_role;
