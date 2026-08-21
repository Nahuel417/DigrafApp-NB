begin;

set local search_path = '';

with legacy_primary_candidates as (
  select distinct on (image.order_id) image.id
  from public.order_design_images image
  where not image.is_primary
    and not exists (
      select 1
      from public.order_design_images primary_image
      where primary_image.order_id = image.order_id
        and primary_image.is_primary
    )
  order by image.order_id, image.created_at, image.id
)
update public.order_design_images image
set is_primary = true
from legacy_primary_candidates candidate
where image.id = candidate.id;

commit;
