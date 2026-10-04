"""Optional content-addressed local resources; each package remains self-contained."""
import hashlib, os, shutil, tempfile
from pathlib import Path

def pool_path():
    return Path(os.environ.get('CGM_RESOURCE_POOL') or Path.home()/'.cache/cgm-workbenches/resources')

def share_resource(source, target, pool=None):
    source,target=Path(source),Path(target)
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():return target
    try:
        data=source.read_bytes();key=hashlib.sha256(data).hexdigest()+source.suffix.lower()
        pool=Path(pool or pool_path());pool.mkdir(parents=True,exist_ok=True);shared=pool/key
        if not shared.exists():
            with tempfile.NamedTemporaryFile(dir=pool,delete=False) as f:f.write(data);temp=Path(f.name)
            try:
                # Publish without replacing an existing immutable version.
                try:os.link(temp,shared)
                except FileExistsError:pass
                except OSError:
                    try:
                        with shared.open('xb') as out:out.write(data)
                    except FileExistsError:pass
            finally:temp.unlink(missing_ok=True)
            try:shared.chmod(0o444)
            except OSError:pass
        if hashlib.sha256(shared.read_bytes()).hexdigest()!=key.rsplit('.',1)[0]:raise OSError('Shared resource checksum mismatch')
        try:os.link(shared,target)
        except FileExistsError:pass
        except OSError:shutil.copyfile(shared,target)
    except OSError:
        # A read-only profile, another disk or disabled sharing still runs normally.
        if not target.exists():shutil.copyfile(source,target)
    return target
