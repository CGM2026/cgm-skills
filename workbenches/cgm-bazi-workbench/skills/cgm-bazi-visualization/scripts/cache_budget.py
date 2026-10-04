"""Estimate recursively retained Python object memory for bounded ephemeral caches."""
import sys
def retained_bytes(value):
    seen=set()
    def size(v):
        if id(v) in seen:return 0
        seen.add(id(v));n=sys.getsizeof(v)
        if isinstance(v,dict):n+=sum(size(k)+size(x) for k,x in v.items())
        elif isinstance(v,(list,tuple,set,frozenset)):n+=sum(size(x) for x in v)
        return n
    return size(value)
